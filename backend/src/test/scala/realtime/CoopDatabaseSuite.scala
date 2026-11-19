package pdoom.tests.realtime

import cats.effect.IO
import cats.syntax.all.*
import io.circe.Json
import munit.CatsEffectSuite
import pdoom.DatabaseBootstrap
import pdoom.services.game.realtime.CoopProtocol
import pdoom.services.user.api.{LogoutUserAPIMessage, RegisterUserAPIMessage}
import pdoom.services.user.objects.AuthenticatedUser
import pdoom.services.user.routes.UserRoutes
import pdoom.system.{DatabaseConfig, DatabaseSession}
import pdoom.tests.support.TestDatabaseTable
import java.util.UUID

class CoopDatabaseSuite extends CatsEffectSuite:
  import CoopSocketTestSupport.*
  private val testUrl = "jdbc:postgresql://127.0.0.1:55439/pdoom_test"
  private def withDatabase(test: DatabaseSession => IO[Unit]): IO[Unit] = for
    _ <- IO(assume(sys.env.get("PDOOM_TEST_DB_URL").contains(testUrl) && sys.env.get("PDOOM_TEST_ISOLATED").contains("1"),
      "Requires explicitly provisioned isolated PostgreSQL; never uses the default DB."))
    schema <- IO("pdoom_test_" + UUID.randomUUID().toString.replace("-", ""))
    _ <- DatabaseSession.resource(DatabaseConfig(testUrl, "pdoom_test", "")).use(db =>
      db.withTransactionConnection(connection => TestDatabaseTable.createSchema(connection, schema)))
    _ <- DatabaseSession.resource(DatabaseConfig(testUrl + "?currentSchema=" + schema, "pdoom_test", "")).use { database =>
      DatabaseBootstrap.initialize(database) *> test(database)
    }
  yield ()

  test("actual PostgreSQL session authenticates socket; logout revokes controls and new connections") {
    withDatabase { database => for
      account <- database.withTransactionConnection(RegisterUserAPIMessage("coop_" + UUID.randomUUID().toString.replace("-", "").take(20), "fixture-coop-password").plan)
      identity <- database.withTransactionConnection(UserRoutes.resolveToken(_, account.token))
      _ <- CoopSocketTestSupport.server(
        token => database.withTransactionConnection(UserRoutes.resolveToken(_, token)),
        user => database.withTransactionConnection(UserRoutes.validateSession(_, user))).use { uri => socket(uri).use { connection => for
          _ <- connection.authenticate(account.token)
          _ <- connection.send(control("create", "buildId" -> str(CoopProtocol.BuildId)))
          room <- connection.next("room")
          _ = assertEquals(room.hcursor.get[Int]("selfSlot").toOption, Some(0))
          _ <- database.withTransactionConnection(LogoutUserAPIMessage(identity.userId, identity.sessionId).plan)
          _ <- connection.send(control("start"))
          error <- connection.next("error")
          _ = assertEquals(field(error, "code"), "unauthorized")
          _ <- socket(uri).use { revoked => for
            _ <- revoked.send(CoopProtocol.event("auth", "token" -> str(account.token)))
            error <- revoked.next("error")
            _ = assertEquals(field(error, "code"), "unauthorized")
          yield () }
        yield () } }
    yield () }
  }

  test("internal live-session validation checks both user/session and expiry without retaining bearer") {
    withDatabase { database => for
      first <- database.withTransactionConnection(RegisterUserAPIMessage("coop_" + UUID.randomUUID().toString.replace("-", "").take(20), "fixture-coop-password").plan)
      second <- database.withTransactionConnection(RegisterUserAPIMessage("coop_" + UUID.randomUUID().toString.replace("-", "").take(20), "fixture-coop-password").plan)
      firstUser <- database.withTransactionConnection(UserRoutes.resolveToken(_, first.token))
      secondUser <- database.withTransactionConnection(UserRoutes.resolveToken(_, second.token))
      _ <- database.withTransactionConnection(UserRoutes.validateSession(_, firstUser))
      spoof <- database.withTransactionConnection(UserRoutes.validateSession(_, AuthenticatedUser(secondUser.userId, firstUser.sessionId))).attempt
      _ = assert(spoof.isLeft)
      _ <- database.withTransactionConnection(TestDatabaseTable.expire(_, first.user.username))
      expired <- database.withTransactionConnection(UserRoutes.validateSession(_, firstUser)).attempt
      _ = assert(expired.isLeft)
    yield () }
  }
