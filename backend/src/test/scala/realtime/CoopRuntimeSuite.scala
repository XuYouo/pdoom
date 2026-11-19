package pdoom.tests.realtime

import cats.effect.{IO, Resource}
import cats.effect.std.Queue
import cats.syntax.all.*
import io.circe.Json
import io.circe.parser.parse
import munit.CatsEffectSuite
import org.http4s.websocket.WebSocketFrame
import pdoom.services.game.realtime.*
import pdoom.services.user.objects.{AuthenticatedUser, SessionId, UserId}
import pdoom.system.HttpError
import java.util.UUID
import scala.concurrent.duration.*

class CoopRuntimeSuite extends CatsEffectSuite:
  private val users = List.fill(4)(AuthenticatedUser(UserId(UUID.randomUUID()), SessionId(UUID.randomUUID())))
  private val tokens = List("a", "b", "c", "d").map(_ * 43)
  private def runtime(grace: FiniteDuration = 30.seconds) = CoopRuntime.resource(
    token => IO.fromOption(tokens.indexOf(token) match
      case -1 => None
      case index => Some(users(index)))(HttpError.Unauthorized), _ => IO.unit, grace)
  private def message(kind: String, fields: (String, Json)*): Json = CoopProtocol.event(kind, fields*)
  private def str(value: String) = Json.fromString(value)
  private def control(kind: String, fields: (String, Json)*): Json = message(kind, (Seq("requestId" -> str(UUID.randomUUID().toString)) ++ fields)*)
  private def field(json: Json, name: String): String = json.hcursor.get[String](name).toOption.get
  private val input = parse("""{"move":1,"jumpPressed":false,"jumpHeld":false,"dashPressed":false,"fire":true,"aim":null,"rewindPressed":false,"insightPressed":false,"rerollPressed":false,"reviveHeld":true}""").toOption.get
  private case class Probe(peer: CoopPeer, events: Queue[IO, Json], runtime: CoopRuntime):
    def send(value: Json): IO[Unit] = runtime.receive(peer.id, value.noSpaces)
    def nextOf(kinds: Set[String]): IO[Json] = events.take.flatMap(value => if kinds.contains(field(value, "type")) then IO.pure(value) else nextOf(kinds)).timeout(3.seconds)
    def next(kind: String): IO[Json] = nextOf(Set(kind))
    def expectError(code: String): IO[Unit] = next("error").map(value => assertEquals(field(value, "code"), code))
    def room: IO[Json] = next("room")
  private def probe(runtime: CoopRuntime, user: Int): Resource[IO, Probe] = for
    peer <- runtime.connect
    events <- Resource.eval(Queue.unbounded[IO, Json])
    _ <- Resource.make(peer.outgoing.evalMap {
      case text: WebSocketFrame.Text => IO.fromEither(parse(text.str)).flatMap(events.offer)
      case _ => IO.unit
    }.compile.drain.start)(_.cancel)
    result = Probe(peer, events, runtime)
    _ <- Resource.eval(result.send(message("auth", "token" -> str(tokens(user)))) *> result.next("authenticated"))
  yield result
  private def create(host: Probe): IO[Json] = host.send(control("create", "buildId" -> str(CoopProtocol.BuildId))) *> host.room
  private def join(guest: Probe, room: Json): IO[Json] = guest.send(control("join", "code" -> str(field(room, "code")), "buildId" -> str(CoopProtocol.BuildId))) *> guest.room
  private def start(host: Probe, guest: Probe): IO[Unit] = for
    _ <- host.send(control("ready", "ready" -> Json.True))
    _ <- guest.send(control("ready", "ready" -> Json.True))
    _ <- host.send(control("start"))
    _ <- awaitPhase(host, "playing")
    _ <- awaitPhase(guest, "playing")
  yield ()
  private def awaitPhase(probe: Probe, phase: String): IO[Json] = probe.room.flatMap(room =>
    if field(room, "phase") == phase then IO.pure(room) else awaitPhase(probe, phase))

  test("protocol rejects spoofed envelopes, invalid controls, invalid numeric input and oversized state") {
    val valid = message("input", "seq" -> Json.fromInt(1), "payload" -> input)
    assert(CoopProtocol.decode(valid.noSpaces).isRight)
    assert(CoopProtocol.decode(valid.mapObject(_.add("slot", Json.fromInt(0))).noSpaces).isLeft)
    assert(CoopProtocol.decode(control("command", "action" -> str("next-stage")).noSpaces).isLeft)
    assert(CoopProtocol.decode(valid.mapObject(_.add("payload", input.mapObject(_.add("move", Json.fromInt(8))))).noSpaces).isLeft)
    assert(CoopProtocol.decode(message("input", "seq" -> Json.fromLong(-1), "payload" -> input).noSpaces).isLeft)
    assertEquals(CoopProtocol.decode(message("state", "seq" -> Json.fromInt(0), "payload" -> Json.obj("data" -> str("x" * 65536))).noSpaces).left.toOption.get.code, "message_too_large")
    assert(CoopProtocol.decode(message("state", "seq" -> Json.fromInt(0), "payload" -> Json.obj("value" -> parse("1e999").toOption.get)).noSpaces).isLeft)
  }

  test("atomic two-seat room, preparation, authority and server-bound input/state forwarding") {
    runtime().use { runtime => (probe(runtime, 0), probe(runtime, 1), probe(runtime, 2)).tupled.use { case (host, guest, third) => for
      room <- create(host)
      request = control("join", "code" -> str(field(room, "code")), "buildId" -> str(CoopProtocol.BuildId))
      _ <- (guest.send(request), third.send(request)).parTupled
      results <- (guest.nextOf(Set("room", "error")), third.nextOf(Set("room", "error"))).tupled
      _ = assertEquals(List(results._1, results._2).count(value => field(value, "type") == "room"), 1)
      _ = assertEquals(List(results._1, results._2).find(value => field(value, "type") == "error").map(field(_, "code")), Some("room_full"))
    yield () } }
  }

  test("only ready host starts; guest input and host state carry trusted slots and monotonic sequences") {
    runtime().use { runtime => (probe(runtime, 0), probe(runtime, 1)).tupled.use { case (host, guest) => for
      room <- create(host)
      _ <- join(guest, room)
      _ <- guest.send(control("start")) *> guest.expectError("forbidden")
      _ <- host.send(control("start")) *> host.expectError("not_ready")
      _ <- start(host, guest)
      _ <- guest.send(message("input", "seq" -> Json.fromInt(0), "payload" -> input))
      forwarded <- host.next("input")
      _ = assertEquals(forwarded.hcursor.get[Int]("slot").toOption, Some(1))
      _ = assertEquals(field(forwarded, "connectionId"), guest.peer.id)
      _ = assertEquals(forwarded.hcursor.downField("payload").focus, Some(input))
      _ = assert(!forwarded.noSpaces.contains(users(1).userId.value.toString))
      _ <- guest.send(message("input", "seq" -> Json.fromInt(0), "payload" -> input)) *> guest.expectError("stale_sequence")
      _ <- guest.send(message("state", "seq" -> Json.fromInt(1), "payload" -> Json.obj())) *> guest.expectError("forbidden")
      _ <- host.send(message("state", "seq" -> Json.fromInt(0), "payload" -> Json.obj("tick" -> Json.fromInt(120))))
      snapshot <- guest.next("state")
      _ = assertEquals(snapshot.hcursor.get[Int]("slot").toOption, Some(0))
      _ <- guest.send(control("command", "action" -> str("resume"))) *> guest.expectError("forbidden")
      _ <- guest.send(control("command", "action" -> str("pause")))
      hostCommand <- host.next("command")
      guestCommand <- guest.next("command")
      _ = assertEquals(hostCommand, guestCommand)
      _ = assertEquals(hostCommand.hcursor.get[Int]("slot").toOption, Some(1))
    yield () } }
  }

  test("same user cannot take a second seat; reconnect supersedes socket and requires a fresh world before resume") {
    runtime().use { runtime => (probe(runtime, 0), probe(runtime, 1), probe(runtime, 1)).tupled.use { case (host, guest, replacement) => for
      room <- create(host)
      _ <- join(guest, room)
      _ <- replacement.send(control("join", "code" -> str(field(room, "code")), "buildId" -> str(CoopProtocol.BuildId))) *> replacement.expectError("already_in_room")
      _ <- start(host, guest)
      _ <- replacement.send(control("reconnect", "roomId" -> str(field(room, "roomId"))))
      _ <- guest.expectError("connection_replaced")
      _ <- awaitPhase(host, "reconnecting")
      restored <- awaitPhase(replacement, "reconnecting")
      _ = assertEquals(restored.hcursor.get[Int]("selfSlot").toOption, Some(1))
      _ <- runtime.disconnect(guest.peer.id)
      _ <- host.send(control("command", "action" -> str("resume"))) *> host.expectError("resync_required")
      _ <- replacement.send(message("input", "seq" -> Json.fromInt(0), "payload" -> input)) *> replacement.expectError("invalid_phase")
      _ <- host.send(message("state", "seq" -> Json.fromInt(0), "payload" -> Json.obj("tick" -> Json.fromInt(120))))
      _ <- replacement.next("state")
      _ <- host.send(control("command", "action" -> str("resume")))
      _ <- awaitPhase(replacement, "playing")
      _ <- replacement.send(message("input", "seq" -> Json.fromInt(0), "payload" -> input))
      _ <- host.next("input")
    yield () } }
  }

  test("lobby disconnect resumes lobby; guest leave frees seat, host leave closes room") {
    runtime().use { runtime => (probe(runtime, 0), probe(runtime, 1), probe(runtime, 1), probe(runtime, 2)).tupled.use { case (host, guest, replacement, third) => for
      room <- create(host)
      _ <- join(guest, room)
      _ <- runtime.disconnect(guest.peer.id)
      _ <- replacement.send(control("reconnect", "roomId" -> str(field(room, "roomId"))))
      restored <- awaitPhase(replacement, "lobby")
      _ = assertEquals(restored.hcursor.get[Option[String]]("matchId").toOption, Some(None))
      _ <- replacement.send(control("leave")) *> replacement.next("left")
      joined <- join(third, room)
      _ = assertEquals(joined.hcursor.get[Int]("selfSlot").toOption, Some(1))
      _ <- host.send(control("leave"))
      closed <- third.next("closed")
      _ = assertEquals(field(closed, "reason"), "host_left")
    yield () } }
  }

  test("disconnected seat expires; a stranger cannot reconnect to another user's room") {
    runtime(50.millis).use { runtime => (probe(runtime, 0), probe(runtime, 1), probe(runtime, 2)).tupled.use { case (host, guest, stranger) => for
      room <- create(host)
      _ <- join(guest, room)
      _ <- stranger.send(control("reconnect", "roomId" -> str(field(room, "roomId")))) *> stranger.expectError("forbidden")
      _ <- runtime.disconnect(guest.peer.id)
      closed <- host.next("closed")
      _ = assertEquals(field(closed, "reason"), "reconnect_timeout")
      _ <- stranger.send(control("join", "code" -> str(field(room, "code")), "buildId" -> str(CoopProtocol.BuildId))) *> stranger.expectError("room_not_found")
    yield () } }
  }

  test("invalid first message, repeated authentication and command bursts fail closed") {
    runtime().use { runtime => for
      _ <- runtime.connect.use { peer =>
        runtime.receive(peer.id, control("create", "buildId" -> str(CoopProtocol.BuildId)).noSpaces) *>
          peer.outgoing.collect { case value: WebSocketFrame.Text => parse(value.str).toOption.get }.take(1).compile.lastOrError.map(value =>
            assertEquals(field(value, "code"), "unauthorized"))
      }
      _ <- probe(runtime, 0).use { host => for
        _ <- create(host)
        _ <- (0 until 31).toList.traverse_(_ => host.send(control("ready", "ready" -> Json.True)))
        _ <- host.expectError("rate_limited")
      yield () }
      _ <- probe(runtime, 1).use { guest => guest.send(message("auth", "token" -> str(tokens(1)))) *> guest.expectError("unauthorized") }
    yield () }
  }

  test("state backlog keeps only latest snapshot and slow input receiver closes within bounded capacity") {
    runtime().use { runtime => probe(runtime, 0).use { host => runtime.connect.use { slowGuest => for
      _ <- runtime.receive(slowGuest.id, message("auth", "token" -> str(tokens(1))).noSpaces)
      room <- create(host)
      _ <- runtime.receive(slowGuest.id, control("join", "code" -> str(field(room, "code")), "buildId" -> str(CoopProtocol.BuildId)).noSpaces)
      _ <- host.send(control("ready", "ready" -> Json.True))
      _ <- runtime.receive(slowGuest.id, control("ready", "ready" -> Json.True).noSpaces)
      _ <- host.send(control("start"))
      _ <- awaitPhase(host, "playing")
      _ <- (0 until 20).toList.traverse_(seq => host.send(message("state", "seq" -> Json.fromInt(seq), "payload" -> Json.obj("tick" -> Json.fromInt(seq)))))
      latest <- slowGuest.outgoing.collect { case text: WebSocketFrame.Text => parse(text.str).toOption.get }
        .filter(value => field(value, "type") == "state").take(1).compile.lastOrError.timeout(3.seconds)
      _ = assertEquals(latest.hcursor.get[Int]("seq").toOption, Some(19))
    yield () } } } *> runtime().use { runtime => runtime.connect.use { slowHost => probe(runtime, 1).use { guest => for
      _ <- runtime.receive(slowHost.id, message("auth", "token" -> str(tokens(0))).noSpaces)
      _ <- runtime.receive(slowHost.id, control("create", "buildId" -> str(CoopProtocol.BuildId)).noSpaces)
      room <- slowHost.outgoing.collect { case text: WebSocketFrame.Text => parse(text.str).toOption.get }
        .filter(value => field(value, "type") == "room").take(1).compile.lastOrError.timeout(3.seconds)
      _ <- join(guest, room)
      _ <- runtime.receive(slowHost.id, control("ready", "ready" -> Json.True).noSpaces)
      _ <- guest.send(control("ready", "ready" -> Json.True))
      _ <- runtime.receive(slowHost.id, control("start").noSpaces)
      _ <- awaitPhase(guest, "playing")
      _ <- (0 until 60).toList.traverse_(seq => guest.send(message("input", "seq" -> Json.fromInt(seq), "payload" -> input)))
      error <- slowHost.outgoing.collect { case text: WebSocketFrame.Text => parse(text.str).toOption.get }
        .filter(value => field(value, "type") == "error").take(1).compile.lastOrError.timeout(3.seconds)
      _ = assertEquals(field(error, "code"), "slow_consumer")
    yield () } } }
  }

  test("host live socket replacement emits a new trusted epoch and accepts sequence zero") {
    runtime().use { runtime => (probe(runtime, 0), probe(runtime, 1), probe(runtime, 0)).tupled.use { case (host, guest, replacement) => for
      room <- create(host)
      _ <- join(guest, room)
      _ <- start(host, guest)
      _ <- host.send(message("state", "seq" -> Json.fromInt(100), "payload" -> Json.obj("tick" -> Json.fromInt(60))))
      previous <- guest.next("state")
      _ = assertEquals(field(previous, "connectionId"), host.peer.id)
      _ <- replacement.send(control("reconnect", "roomId" -> str(field(room, "roomId"))))
      _ <- host.expectError("connection_replaced")
      _ <- awaitPhase(guest, "reconnecting")
      _ <- replacement.send(message("state", "seq" -> Json.fromInt(0), "payload" -> Json.obj("tick" -> Json.fromInt(60))))
      fresh <- guest.next("state")
      _ = assertEquals(field(fresh, "connectionId"), replacement.peer.id)
      _ = assertEquals(fresh.hcursor.get[Int]("seq").toOption, Some(0))
      _ <- runtime.disconnect(host.peer.id)
      _ <- replacement.send(control("command", "action" -> str("resume")))
      resumed <- awaitPhase(guest, "playing")
      _ = assertEquals(resumed.hcursor.downField("players").focus.flatMap(_.asArray).map(_.count(_.hcursor.get[Boolean]("connected").toOption.contains(true))), Some(2))
    yield () } }
  }

  test("authentication infrastructure failure never claims the user's session was revoked") {
    CoopRuntime.resource(_ => IO.raiseError(new java.sql.SQLException("fixture connection unavailable")), _ => IO.unit).use { runtime =>
      runtime.connect.use { peer => for
        _ <- runtime.receive(peer.id, message("auth", "token" -> str(tokens(0))).noSpaces)
        error <- peer.outgoing.collect { case text: WebSocketFrame.Text => parse(text.str).toOption.get }
          .filter(value => field(value, "type") == "error").take(1).compile.lastOrError.timeout(3.seconds)
        _ = assertEquals(field(error, "code"), "auth_unavailable")
        _ = assert(!error.noSpaces.contains("SQLException"))
      yield () }
    }
  }
