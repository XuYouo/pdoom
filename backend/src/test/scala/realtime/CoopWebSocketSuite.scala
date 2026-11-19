package pdoom.tests.realtime

import cats.effect.{IO, Resource}
import cats.syntax.all.*
import com.comcast.ip4s.{Host, Port}
import io.circe.Json
import io.circe.parser.parse
import munit.CatsEffectSuite
import org.http4s.ember.server.EmberServerBuilder
import pdoom.services.game.realtime.*
import pdoom.services.user.objects.{AuthenticatedUser, SessionId, UserId}
import pdoom.system.HttpError
import pdoom.system.api.AttemptLimiter
import java.net.URI
import java.net.http.{HttpClient, WebSocket, WebSocketHandshakeException}
import java.util.UUID
import java.util.concurrent.{CompletableFuture, CompletionStage, LinkedBlockingQueue, TimeUnit}
import scala.concurrent.duration.*

object CoopSocketTestSupport:
  val origin = "http://127.0.0.1:8080"
  def str(value: String): Json = Json.fromString(value)
  def field(value: Json, name: String): String = value.hcursor.get[String](name).toOption.get
  def control(kind: String, values: (String, Json)*): Json = CoopProtocol.event(kind,
    (Seq("requestId" -> str(UUID.randomUUID().toString)) ++ values)*)
  final class Socket private[CoopSocketTestSupport] (val socket: WebSocket, events: LinkedBlockingQueue[Json]):
    def send(value: Json): IO[Unit] = IO.fromCompletableFuture(IO(socket.sendText(value.noSpaces, true))).void
    def sendText(value: String, last: Boolean = true): IO[Unit] = IO.fromCompletableFuture(IO(socket.sendText(value, last))).void
    def next(kind: String): IO[Json] = IO.blocking(Option(events.poll(5, TimeUnit.SECONDS))).flatMap {
      case None => IO.raiseError(new AssertionError(s"Missing WebSocket event: $kind"))
      case Some(value) => if field(value, "type") == kind then IO.pure(value) else next(kind)
    }.timeout(6.seconds)
    def authenticate(token: String): IO[Unit] = send(CoopProtocol.event("auth", "token" -> str(token))) *> next("authenticated").void

  def socket(uri: URI, source: String = origin): Resource[IO, Socket] = Resource.make(for
    events <- IO(new LinkedBlockingQueue[Json](512))
    listener = new WebSocket.Listener:
      private val text = new StringBuilder
      override def onOpen(ws: WebSocket): Unit = ws.request(1)
      override def onText(ws: WebSocket, data: CharSequence, last: Boolean): CompletionStage[?] =
        text.append(data)
        if last then
          parse(text.toString).foreach(events.offer)
          text.clear()
        ws.request(1)
        CompletableFuture.completedFuture(null)
      override def onClose(ws: WebSocket, status: Int, reason: String): CompletionStage[?] =
        events.offer(CoopProtocol.event("transport-closed", "status" -> Json.fromInt(status)))
        CompletableFuture.completedFuture(null)
      override def onError(ws: WebSocket, error: Throwable): Unit =
        events.offer(CoopProtocol.event("transport-error", "message" -> str(error.getClass.getSimpleName)))
    client <- IO(HttpClient.newBuilder().connectTimeout(java.time.Duration.ofSeconds(3)).build())
    ws <- IO.fromCompletableFuture(IO(client.newWebSocketBuilder().header("Origin", source).buildAsync(uri, listener)))
  yield new Socket(ws, events))(value => IO(value.socket.abort()))

  def server(authenticate: String => IO[AuthenticatedUser], validate: AuthenticatedUser => IO[Unit] = _ => IO.unit,
      grace: FiniteDuration = 30.seconds): Resource[IO, URI] = for
    runtime <- CoopRuntime.resource(authenticate, validate, grace)
    limiter <- Resource.eval(AttemptLimiter.create())
    server <- EmberServerBuilder.default[IO].withHost(Host.fromString("127.0.0.1").get).withPort(Port.fromInt(0).get)
      .withHttpWebSocketApp(builder => CoopRoutes(runtime, builder, Set(origin), limiter).orNotFound).build
  yield URI.create(server.baseUri.toString.stripSuffix("/").replace("http://", "ws://") + "/realtime/coop")

class CoopWebSocketSuite extends CatsEffectSuite:
  import CoopSocketTestSupport.*
  private val users = Vector.fill(3)(AuthenticatedUser(UserId(UUID.randomUUID()), SessionId(UUID.randomUUID())))
  private val tokens = Vector("h", "g", "s").map(_ * 43)
  private val server = CoopSocketTestSupport.server(token => IO.fromOption(tokens.indexOf(token) match
    case -1 => None
    case index => Some(users(index)))(HttpError.Unauthorized))
  private def phase(socket: Socket, expected: String): IO[Json] = socket.next("room").flatMap(room =>
    if field(room, "phase") == expected then IO.pure(room) else phase(socket, expected))
  private def pair(uri: URI): Resource[IO, (Socket, Socket)] = (socket(uri), socket(uri)).tupled.evalTap { case (host, guest) =>
    host.authenticate(tokens(0)) *> guest.authenticate(tokens(1))
  }
  private def playing(host: Socket, guest: Socket): IO[Json] = for
    _ <- host.send(control("create", "buildId" -> str(CoopProtocol.BuildId)))
    room <- host.next("room")
    _ <- guest.send(control("join", "code" -> str(field(room, "code")), "buildId" -> str(CoopProtocol.BuildId)))
    _ <- guest.next("room")
    _ <- host.send(control("ready", "ready" -> Json.True))
    _ <- host.next("ack")
    _ <- guest.send(control("ready", "ready" -> Json.True))
    // Explicitly wait for the ready ack: sending across different sockets does not imply ordering.
    _ <- guest.next("ack")
    _ <- guest.next("ack")
    _ <- host.send(control("start"))
    _ <- phase(host, "playing")
    _ <- phase(guest, "playing")
  yield room

  test("real Ember WebSocket rejects foreign Origin, unauthenticated control and invalid bearer") {
    server.use { uri => for
      rejected <- socket(uri, "https://foreign.invalid").use(_ => IO.unit).attempt
      _ = rejected match
        case Left(error: WebSocketHandshakeException) => assertEquals(error.getResponse.statusCode(), 403)
        case other => fail(s"Expected forbidden WebSocket Origin, got $other")
      _ <- socket(uri).use { connection => for
        _ <- connection.send(control("create", "buildId" -> str(CoopProtocol.BuildId)))
        error <- connection.next("error")
        _ = assertEquals(field(error, "code"), "unauthorized")
        closed <- connection.next("transport-closed")
        _ = assertEquals(closed.hcursor.get[Int]("status").toOption, Some(1008))
      yield () }
      _ <- socket(uri).use { connection => for
        _ <- connection.send(CoopProtocol.event("auth", "token" -> str("x" * 43)))
        error <- connection.next("error")
        _ = assertEquals(field(error, "code"), "unauthorized")
      yield () }
    yield () }
  }

  test("two actual sockets authenticate, prepare, exchange guest input and host world, then reconnect paused") {
    server.use { uri => pair(uri).use { case (host, guest) => for
      room <- playing(host, guest)
      payload = parse("""{"move":1,"jumpPressed":false,"jumpHeld":true,"dashPressed":false,"fire":true,"aim":{"x":1,"y":0},"rewindPressed":false,"insightPressed":false,"rerollPressed":false,"reviveHeld":false}""").toOption.get
      _ <- guest.send(CoopProtocol.event("input", "seq" -> Json.fromInt(0), "payload" -> payload))
      input <- host.next("input")
      _ = assertEquals(input.hcursor.get[Int]("slot").toOption, Some(1))
      _ = assert(scala.util.Try(UUID.fromString(field(input, "connectionId"))).isSuccess)
      _ = assertEquals(input.hcursor.downField("payload").focus, Some(payload))
      _ <- host.send(CoopProtocol.event("state", "seq" -> Json.fromInt(0), "payload" -> Json.obj("tick" -> Json.fromInt(60))))
      state <- guest.next("state")
      _ = assertEquals(state.hcursor.downField("payload").get[Int]("tick").toOption, Some(60))
      _ <- IO(guest.socket.abort())
      _ <- phase(host, "reconnecting")
      _ <- socket(uri).use { replacement => for
        _ <- replacement.authenticate(tokens(1))
        _ <- replacement.send(control("reconnect", "roomId" -> str(field(room, "roomId"))))
        _ <- phase(replacement, "reconnecting")
        _ <- host.send(control("command", "action" -> str("resume")))
        error <- host.next("error")
        _ = assertEquals(field(error, "code"), "resync_required")
        _ <- host.send(CoopProtocol.event("state", "seq" -> Json.fromInt(1), "payload" -> Json.obj("tick" -> Json.fromInt(60))))
        _ <- replacement.next("state")
        _ <- host.send(control("command", "action" -> str("resume")))
        _ <- phase(replacement, "playing")
        _ <- replacement.send(control("leave"))
        closed <- host.next("closed")
        _ = assertEquals(field(closed, "reason"), "guest_left")
      yield () }
    yield () } }
  }

  test("fragmented text authenticates without disabling whole-message byte limit") {
    server.use { uri => socket(uri).use { connection => for
      auth <- IO.pure(CoopProtocol.event("auth", "token" -> str(tokens(0))).noSpaces)
      _ <- connection.sendText(auth.take(20), false)
      _ <- connection.sendText(auth.drop(20), true)
      _ <- connection.next("authenticated")
      _ <- connection.sendText("x" * 40000, false)
      _ <- connection.sendText("x" * 30000, true)
      error <- connection.next("error")
      _ = assertEquals(field(error, "code"), "message_too_large")
      closed <- connection.next("transport-closed")
      _ = assertEquals(closed.hcursor.get[Int]("status").toOption, Some(1009))
    yield () } }
  }

  test("uncredentialed socket is closed after bounded authentication wait") {
    server.use { uri => socket(uri).use { connection => for
      _ <- IO.sleep(2.seconds)
      error <- connection.next("error")
      _ = assertEquals(field(error, "code"), "auth_timeout")
      closed <- connection.next("transport-closed")
      _ = assertEquals(closed.hcursor.get[Int]("status").toOption, Some(1008))
    yield () } }
  }
