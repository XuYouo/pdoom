package pdoom.tests

import cats.effect.{Deferred, IO, Resource}
import cats.syntax.all.*
import com.comcast.ip4s.{Host, Port}
import io.circe.Json
import io.circe.syntax.*
import munit.CatsEffectSuite
import org.http4s.{Header, HttpApp, Method, Request, Uri}
import org.http4s.circe.*
import org.http4s.client.Client
import org.http4s.ember.client.EmberClientBuilder
import org.http4s.ember.server.EmberServerBuilder
import org.typelevel.ci.CIString
import java.util.UUID
import java.sql.Connection
import pdoom.DatabaseBootstrap
import pdoom.routes.ApiRouter
import pdoom.system.{DatabaseConfig, DatabaseSession, HttpError}
import pdoom.system.api.{APIMessage, APIMessageRouter, ApiName, AttemptLimiter, RegisteredAPIMessage}
import pdoom.services.user.api.RegisterUserAPIMessage
import pdoom.services.user.objects.AuthenticatedUser
import pdoom.services.user.objects.apiTypes.AuthResponse
import pdoom.services.user.routes.UserRoutes
import pdoom.tests.support.TestDatabaseTable

class HttpIntegrationSuite extends CatsEffectSuite:
  private val testUrl = "jdbc:postgresql://127.0.0.1:55439/pdoom_test"
  private val password = "fixture-password-not-a-secret"
  private def username: String = "test_" + UUID.randomUUID().toString.replace("-", "").take(20)
  private def uuid: String = UUID.randomUUID().toString
  private def fields(values: (String, Json)*): Json = Json.obj(values*)
  private def number(value: Int): Json = Json.fromInt(value)
  private def text(value: String): Json = Json.fromString(value)
  private def sampleSave: Json = fields(
    "schemaVersion" -> number(1), "runId" -> text(uuid), "seed" -> number(123), "stage" -> number(1),
    "checkpoint" -> number(0), "hp" -> number(100), "doom" -> number(10), "tokens" -> number(8), "score" -> number(70),
    "elapsedMs" -> number(1000), "inventory" -> List("constitutional").asJson, "upgrades" -> List.empty[String].asJson,
    "donated" -> Json.False, "actionCounts" -> fields("shots" -> number(2), "dashes" -> number(1), "rewinds" -> number(0), "insights" -> number(1)))
  private def sampleScore(runId: String = uuid, score: Int = 100): Json = fields(
    "runId" -> text(runId), "score" -> number(score), "stage" -> number(1), "durationMs" -> number(1500),
    "doom" -> number(15), "ending" -> text("defeat"))
  private def update(json: Json, name: String, value: Json): Json = json.mapObject(_.add(name, value))

  private case class Environment(database: DatabaseSession, client: Client[IO], base: Uri, names: Map[String, String]):
    def call(action: String, body: Json = Json.obj(), token: Option[String] = None): IO[(Int, Json)] =
      val request = Request[IO](Method.POST, base / "api" / names(action)).withEntity(body)
      val authenticated = token.fold(request)(value => request.putHeaders(Header.Raw(CIString("Authorization"), s"Bearer $value")))
      client.run(authenticated).use(response => response.as[Json].map(response.status.code -> _))
    def register(name: String = username): IO[AuthResponse] =
      call("RegisterUser", fields("username" -> text(name), "password" -> text(password))).map { response =>
        assertEquals(response._1, 200, clues(response._2))
        response._2.as[AuthResponse].fold(throw _, identity)
      }
    def login(name: String): IO[AuthResponse] =
      call("LoginUser", fields("username" -> text(name), "password" -> text(password))).map { response =>
        assertEquals(response._1, 200, clues(response._2))
        response._2.as[AuthResponse].fold(throw _, identity)
      }

  private def serverResource(database: DatabaseSession, app: HttpApp[IO], names: Map[String, String]): Resource[IO, Environment] =
    for
      server <- EmberServerBuilder.default[IO].withHost(Host.fromString("127.0.0.1").get)
        .withPort(Port.fromInt(0).get).withHttpApp(app).build
      client <- EmberClientBuilder.default[IO].build
    yield Environment(database, client, server.baseUri, names)

  private def withDatabase(test: DatabaseSession => IO[Unit]): IO[Unit] =
    for
      _ <- IO {
        assume(sys.env.get("PDOOM_TEST_DB_URL").contains(testUrl) && sys.env.get("PDOOM_TEST_ISOLATED").contains("1"),
          "Integration tests require the explicitly provisioned isolated cluster; no default database is used.")
      }
      schema <- IO.delay("pdoom_test_" + UUID.randomUUID().toString.replace("-", ""))
      _ <- DatabaseSession.resource(DatabaseConfig(testUrl, "pdoom_test", "")).use { db =>
        db.withTransactionConnection(connection => TestDatabaseTable.createSchema(connection, schema))
      }
      _ <- DatabaseSession.resource(DatabaseConfig(testUrl + "?currentSchema=" + schema, "pdoom_test", "")).use { database =>
        DatabaseBootstrap.initialize(database) *> test(database)
      }
    yield ()

  private def withServer(test: Environment => IO[Unit]): IO[Unit] = withDatabase { database =>
    for
      app <- ApiRouter.build(database)
      names <- ApiName.load
      _ <- serverResource(database, app, names).use(test)
    yield ()
  }

  private def error(response: (Int, Json), status: Int): Unit =
    assertEquals(response._1, status)
    assertEquals(response._2.asObject.get.keys.toSet, Set("code", "message", "requestId"))
    assert(UUID.fromString(response._2.hcursor.get[String]("requestId").toOption.get).toString.nonEmpty)

  test("all 8 actions: real HTTP registration/login, save/load, score/list and logout") {
    withServer { env =>
      val name = username
      val save = sampleSave
      for
        empty <- env.call("ListLeaderboard", fields("limit" -> number(10), "offset" -> number(0)))
        first <- env.register(name)
        loggedIn <- env.login(name.toUpperCase(java.util.Locale.ROOT))
        current <- env.call("GetCurrentUser", token = Some(loggedIn.token))
        none <- env.call("LoadGame", token = Some(first.token))
        saved <- env.call("SaveGame", fields("save" -> save, "expectedRevision" -> number(0)), Some(first.token))
        loaded <- env.call("LoadGame", token = Some(loggedIn.token))
        score <- env.call("SubmitScore", sampleScore(), Some(first.token))
        leaderboard <- env.call("ListLeaderboard", fields("limit" -> number(10), "offset" -> number(0)))
        logout <- env.call("LogoutUser", token = Some(first.token))
        revoked <- env.call("GetCurrentUser", token = Some(first.token))
        otherSession <- env.call("GetCurrentUser", token = Some(loggedIn.token))
        hashes <- env.database.withTransactionConnection(TestDatabaseTable.hashes(_, name))
      yield
        assertEquals(empty._2.hcursor.get[List[Json]]("entries"), Right(Nil))
        assertEquals(current._2.hcursor.downField("user").get[String]("id"), Right(first.user.id))
        assertEquals(none._2.hcursor.get[Long]("revision"), Right(0L))
        assert(none._2.hcursor.downField("save").focus.get.isNull)
        assertEquals(saved._1, 200)
        assertEquals(loaded._2.hcursor.downField("save").focus, Some(save))
        assertEquals(loaded._2.hcursor.get[Long]("revision"), Right(1L))
        assertEquals(score._1, 200)
        assertEquals(leaderboard._2.hcursor.get[List[Json]]("entries").toOption.get.size, 1)
        assertEquals(logout._2, fields("loggedOut" -> Json.True))
        error(revoked, 401)
        assertEquals(otherSession._1, 200)
        assertEquals(hashes.size, 2)
        hashes.foreach { case (salt, hash, rounds, tokenHash) =>
          assert(salt.nonEmpty && hash.nonEmpty)
          assertEquals(rounds, 600000)
          assert(!hash.contains(password))
          assert(tokenHash.matches("[a-f0-9]{64}"))
          assert(tokenHash != first.token && tokenHash != loggedIn.token)
        }
    }
  }

  test("duplicate names, uniform bad-login errors and input type validation") {
    withServer { env =>
      val name = username
      for
        _ <- env.register(name)
        duplicate <- env.call("RegisterUser", fields("username" -> text(name.toUpperCase), "password" -> text(password)))
        wrong <- env.call("LoginUser", fields("username" -> text(name), "password" -> text("incorrect-value")))
        missing <- env.call("LoginUser", fields("username" -> text(username), "password" -> text("incorrect-value")))
        injection <- env.call("RegisterUser", fields("username" -> text("x'; DROP TABLE users;--"), "password" -> text(password)))
        wrongType <- env.call("RegisterUser", fields("username" -> number(1), "password" -> text(password)))
      yield
        error(duplicate, 409); error(wrong, 401); error(missing, 401); error(injection, 400); error(wrongType, 400)
        assertEquals(wrong._2.hcursor.get[String]("message"), missing._2.hcursor.get[String]("message"))
    }
  }

  test("unauthenticated, expired and forged identities cannot read or overwrite another user's save") {
    withServer { env =>
      val save = sampleSave
      for
        alice <- env.register()
        bob <- env.register()
        unauthorized <- env.call("LoadGame")
        saved <- env.call("SaveGame", fields("save" -> save, "expectedRevision" -> number(0)), Some(alice.token))
        absent <- env.call("LoadGame", token = Some(bob.token))
        forged <- env.call("SaveGame", fields("userId" -> text(alice.user.id), "save" -> save, "expectedRevision" -> number(1)), Some(bob.token))
        role <- env.call("RegisterUser", fields("username" -> text(username), "password" -> text(password), "role" -> text("admin")))
        nested <- env.call("SaveGame", fields("save" -> update(save, "userId", text(alice.user.id)), "expectedRevision" -> number(0)), Some(bob.token))
        bodyToken <- env.call("LoadGame", fields("token" -> text(alice.token)))
        _ <- env.database.withTransactionConnection(TestDatabaseTable.expire(_, alice.user.username))
        expired <- env.call("GetCurrentUser", token = Some(alice.token))
      yield
        error(unauthorized, 401); error(forged, 400); error(role, 400); error(nested, 400); error(bodyToken, 401); error(expired, 401)
        assertEquals(saved._1, 200)
        assertEquals(absent._2.hcursor.get[Long]("revision"), Right(0L))
        assert(absent._2.hcursor.downField("save").focus.get.isNull)
    }
  }

  test("save CAS rejects stale revisions, first-insert races and concurrent updates") {
    withServer { env =>
      val save = sampleSave
      for
        alice <- env.register()
        second <- env.login(alice.user.username)
        initial <- (env.call("SaveGame", fields("save" -> save, "expectedRevision" -> number(0)), Some(alice.token)),
          env.call("SaveGame", fields("save" -> save, "expectedRevision" -> number(0)), Some(second.token))).parTupled
        next <- (env.call("SaveGame", fields("save" -> save, "expectedRevision" -> number(1)), Some(alice.token)),
          env.call("SaveGame", fields("save" -> save, "expectedRevision" -> number(1)), Some(second.token))).parTupled
        loaded <- env.call("LoadGame", token = Some(alice.token))
        stale <- env.call("SaveGame", fields("save" -> save, "expectedRevision" -> number(0)), Some(alice.token))
      yield
        assertEquals(List(initial._1._1, initial._2._1).sorted, List(200, 409))
        assertEquals(List(next._1._1, next._2._1).sorted, List(200, 409))
        assertEquals(loaded._2.hcursor.get[Long]("revision"), Right(2L))
        error(stale, 409)
    }
  }

  test("invalid save and score values fail before any persistence") {
    withServer { env =>
      val save = sampleSave
      for
        user <- env.register()
        badSchema <- env.call("SaveGame", fields("save" -> update(save, "schemaVersion", number(2)), "expectedRevision" -> number(0)), Some(user.token))
        duplicate <- env.call("SaveGame", fields("save" -> update(save, "inventory", List("lisp", "lisp").asJson), "expectedRevision" -> number(0)), Some(user.token))
        negative <- env.call("SaveGame", fields("save" -> save, "expectedRevision" -> number(-1)), Some(user.token))
        fractional <- env.call("SaveGame", fields("save" -> save, "expectedRevision" -> Json.fromDoubleOrNull(1.5)), Some(user.token))
        badEnding <- env.call("SubmitScore", update(sampleScore(), "ending", text("foom")), Some(user.token))
        badDuration <- env.call("SubmitScore", update(sampleScore(), "durationMs", number(999)), Some(user.token))
        noSave <- env.call("LoadGame", token = Some(user.token))
        noScores <- env.call("ListLeaderboard", fields("limit" -> number(10), "offset" -> number(0)))
      yield
        List(badSchema, duplicate, negative, fractional, badEnding, badDuration).foreach(error(_, 400))
        assertEquals(noSave._2.hcursor.get[Long]("revision"), Right(0L))
        assertEquals(noScores._2.hcursor.get[List[Json]]("entries"), Right(Nil))
    }
  }

  List("aligned" -> 8.0, "warden" -> 55.0, "foom" -> 88.0).foreach { case (ending, doom) =>
    test(s"terminal $ending: complete checkpoint90 save round-trips and score retries stay idempotent") {
      withServer { env =>
        val run = uuid
        val save = sampleSave.deepMerge(fields(
          "runId" -> text(run), "stage" -> number(5), "checkpoint" -> number(90), "hp" -> number(67),
          "doom" -> Json.fromDoubleOrNull(doom), "tokens" -> number(123), "score" -> number(4567), "elapsedMs" -> number(123456),
          "inventory" -> List("constitutional", "residual", "lisp").asJson, "upgrades" -> List("reinforced", "calibrated").asJson,
          "donated" -> Json.True, "actionCounts" -> fields("shots" -> number(77), "dashes" -> number(32), "rewinds" -> number(12), "insights" -> number(5))))
        val score = fields("runId" -> text(run), "score" -> number(4567), "stage" -> number(5), "durationMs" -> number(123456),
          "doom" -> Json.fromDoubleOrNull(doom), "ending" -> text(ending))
        for
          user <- env.register()
          saved <- env.call("SaveGame", fields("save" -> save, "expectedRevision" -> number(0)), Some(user.token))
          loaded <- env.call("LoadGame", token = Some(user.token))
          first <- env.call("SubmitScore", score, Some(user.token))
          retry <- env.call("SubmitScore", score, Some(user.token))
          conflict <- env.call("SubmitScore", update(score, "score", number(4568)), Some(user.token))
          count <- env.database.withTransactionConnection(TestDatabaseTable.scoreCount(_, run))
          after <- env.call("LoadGame", token = Some(user.token))
        yield
          assertEquals(saved._1, 200); assertEquals(loaded._1, 200)
          assertEquals(loaded._2.hcursor.downField("save").focus, Some(save))
          assertEquals(loaded._2.hcursor.get[Long]("revision"), Right(1L))
          assertEquals(first._1, 200); assertEquals(retry._1, 200); assertEquals(first._2, retry._2)
          assertEquals(count, 1L); error(conflict, 409)
          assertEquals(after._2, loaded._2) // Uploading a result must not rewrite any completed-save field.
      }
    }
  }

  test("terminal ending/doom mismatches are rejected over real HTTP before any score persists") {
    withServer { env =>
      val invalid = List(("aligned", 30.0, 5), ("warden", 29.999, 5), ("warden", 80.0, 5), ("foom", 79.999, 5), ("aligned", 8.0, 4), ("victory", 100.0, 5))
      for
        user <- env.register()
        results <- invalid.traverse { case (ending, doom, stage) =>
          env.call("SubmitScore", fields("runId" -> text(uuid), "score" -> number(4567), "stage" -> number(stage),
            "durationMs" -> number(123456), "doom" -> Json.fromDoubleOrNull(doom), "ending" -> text(ending)), Some(user.token))
        }
        board <- env.call("ListLeaderboard", fields("limit" -> number(10), "offset" -> number(0)))
      yield
        results.foreach(error(_, 400))
        assertEquals(board._1, 200); assertEquals(board._2.hcursor.get[List[Json]]("entries"), Right(Nil))
    }
  }

  test("score retries are concurrent-idempotent and preserve first personalBest result") {
    withServer { env =>
      val run = uuid
      val input = sampleScore(run)
      for
        user <- env.register()
        second <- env.login(user.user.username)
        responses <- (env.call("SubmitScore", input, Some(user.token)), env.call("SubmitScore", input, Some(second.token))).parTupled
        one <- env.database.withTransactionConnection(TestDatabaseTable.scoreCount(_, run))
        conflict <- env.call("SubmitScore", update(input, "score", number(101)), Some(user.token))
        _ <- env.call("SubmitScore", sampleScore(score = 200), Some(user.token))
        replay <- env.call("SubmitScore", input, Some(user.token))
        other <- env.register()
        independent <- env.call("SubmitScore", input, Some(other.token))
        two <- env.database.withTransactionConnection(TestDatabaseTable.scoreCount(_, run))
      yield
        assertEquals(responses._1._1, 200); assertEquals(responses._2._1, 200)
        assertEquals(responses._1._2, responses._2._2)
        assertEquals(responses._1._2, replay._2)
        assertEquals(replay._2.hcursor.get[Boolean]("personalBest"), Right(true))
        assertEquals(one, 1L); error(conflict, 409)
        assertEquals(independent._1, 200); assertEquals(two, 2L)
    }
  }

  test("leaderboard uses bounded stable pages with real data and deterministic ranks") {
    withServer { env =>
      for
        user <- env.register()
        _ <- List(100, 300, 200).traverse(score => env.call("SubmitScore", sampleScore(score = score), Some(user.token)))
        first <- env.call("ListLeaderboard", fields("limit" -> number(2), "offset" -> number(0)))
        last <- env.call("ListLeaderboard", fields("limit" -> number(2), "offset" -> number(2)))
        invalid <- List((0, 0), (51, 0), (1, -1), (1, 10001)).traverse { case (limit, offset) =>
          env.call("ListLeaderboard", fields("limit" -> number(limit), "offset" -> number(offset)))
        }
      yield
        val entries = first._2.hcursor.get[List[Json]]("entries").toOption.get
        assertEquals(entries.map(_.hcursor.get[Int]("score").toOption.get), List(300, 200))
        assertEquals(entries.map(_.hcursor.get[Int]("rank").toOption.get), List(1, 2))
        assertEquals(first._2.hcursor.get[Int]("nextOffset"), Right(2))
        assert(last._2.hcursor.downField("nextOffset").focus.get.isNull)
        assertEquals(last._2.hcursor.get[List[Json]]("entries").toOption.get.head.hcursor.get[Int]("rank"), Right(3))
        invalid.foreach(error(_, 400))
    }
  }

  test("HTTP parser bounds bodies, rejects malformed JSON and unknown routes") {
    withServer { env =>
      def raw(path: String, input: String, json: Boolean = true): IO[(Int, Json)] =
        val request = Request[IO](Method.POST, env.base / "api" / path).withEntity(input)
        val typed = if json then request.putHeaders(Header.Raw(CIString("Content-Type"), "application/json")) else request
        env.client.run(typed).use(response => response.as[Json].map(response.status.code -> _))
      for
        malformed <- raw("loadgameapi", "{broken")
        oversized <- raw("savegameapi", " " * 65537)
        contentType <- raw("loadgameapi", "{}", false)
        array <- raw("loadgameapi", "[]")
        nested <- raw("loadgameapi", "{\"extra\":" + ("[" * 40) + "0" + ("]" * 40) + "}")
        unknown <- raw("notregisteredapi", "{}")
      yield
        List(malformed, oversized, contentType, array, nested).foreach(error(_, 400))
        error(unknown, 404)
    }
  }

  test("real HTTP registration/login limiter returns 429 and ignores forwarded identity") {
    withServer { env =>
      val invalid = fields("username" -> text("!"), "password" -> text(password))
      for
        attempts <- (1 to 21).toList.traverse { index =>
          val request = Request[IO](Method.POST, env.base / "api" / env.names("LoginUser")).withEntity(invalid)
            .putHeaders(Header.Raw(CIString("X-Forwarded-For"), s"192.0.2.$index"))
          env.client.run(request).use(response => response.as[Json].map(response.status.code -> _))
        }
      yield
        assert(attempts.take(20).forall(_._1 == 401))
        error(attempts.last, 429)
    }
  }

  test("unknown 500 is redacted and all multi-table writes roll back") {
    withDatabase { database =>
      val name = username
      val fault: RegisteredAPIMessage[AuthenticatedUser] = RegisteredAPIMessage.public[AuthenticatedUser, Json, Json]("Probe") { _ =>
        new APIMessage[Json]:
          def plan(connection: Connection): IO[Json] =
            RegisterUserAPIMessage(name, password).plan(connection) *>
              IO.raiseError(new IllegalStateException("SELECT password_hash FROM users; private-token-do-not-leak"))
      }
      for
        limiter <- AttemptLimiter.create()
        app = new APIMessageRouter(database, Map("Probe" -> "probeapi"), List(fault), UserRoutes.resolveToken, limiter).app
        _ <- serverResource(database, app, Map("Probe" -> "probeapi")).use { env =>
          for
            response <- env.call("Probe")
            count <- database.withTransactionConnection(TestDatabaseTable.countUsers(_, name))
          yield
            error(response, 500)
            assertEquals(response._2.hcursor.get[String]("message"), Right("An internal error occurred."))
            assert(!response._2.noSpaces.contains("password_hash"))
            assert(!response._2.noSpaces.contains("private-token"))
            assertEquals(count, 0L)
        }
      yield ()
    }
  }

  test("health checks a real database transaction and unavailable pools return safe 503") {
    withDatabase { database =>
      def check(db: DatabaseSession, expectedStatus: Int, expectedHealthy: Boolean): IO[Unit] =
        for
          app <- ApiRouter.build(db)
          names <- ApiName.load
          _ <- serverResource(db, app, names).use { env =>
            env.client.run(Request[IO](Method.GET, env.base / "health")).use { response =>
              response.as[Json].map { body =>
                assertEquals(response.status.code, expectedStatus)
                assertEquals(body, fields("ok" -> Json.fromBoolean(expectedHealthy)))
              }
            }
          }
        yield ()
      for
        _ <- check(database, 200, true)
        // Intentionally keep only the already-closed pool handle: no fake database implementation.
        closed <- DatabaseSession.resource(DatabaseConfig(testUrl, "pdoom_test", "")).use(IO.pure)
        _ <- check(closed, 503, false)
      yield ()
    }
  }

  test("cancelling a transaction rolls back user and session creation") {
    withDatabase { database =>
      val name = username
      for
        written <- Deferred[IO, Unit]
        fiber <- database.withTransactionConnection { connection =>
          RegisterUserAPIMessage(name, password).plan(connection) *> written.complete(()) *> IO.never[Unit]
        }.start
        _ <- written.get
        _ <- fiber.cancel
        count <- database.withTransactionConnection(TestDatabaseTable.countUsers(_, name))
      yield assertEquals(count, 0L)
    }
  }
