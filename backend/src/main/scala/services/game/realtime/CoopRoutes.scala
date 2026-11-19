package pdoom.services.game.realtime

import cats.effect.{Deferred, IO, Ref}
import cats.effect.std.Queue
import cats.syntax.all.*
import fs2.Stream
import org.http4s.{Header, HttpRoutes, Method, Response, Status}
import org.http4s.server.websocket.WebSocketBuilder2
import org.http4s.websocket.WebSocketFrame
import org.typelevel.ci.CIString
import pdoom.system.api.AttemptLimiter
import scodec.bits.ByteVector

/** Upgrade separately from APIMessageRouter: a socket never owns a JDBC connection. */
object CoopRoutes:
  def apply(runtime: CoopRuntime, builder: WebSocketBuilder2[IO], origins: Set[String], limiter: AttemptLimiter): HttpRoutes[IO] =
    HttpRoutes.of[IO] { case request if request.method == Method.GET && request.uri.path.renderString == "/realtime/coop" =>
      val sourceOrigins = request.headers.headers.filter(_.name == CIString("Origin")).map(_.value)
      val allowed = sourceOrigins.size == 1 && origins.contains(sourceOrigins.head) && request.uri.query.isEmpty
      if !allowed then IO.pure(Response[IO](Status.Forbidden).withEntity("WebSocket origin is not allowed.")
        .putHeaders(Header.Raw(CIString("Cache-Control"), "no-store")))
      else limiter.check(request.remoteAddr.fold("unknown")(_.toString)).attempt.flatMap {
        case Left(_) => IO.pure(Response[IO](Status.TooManyRequests).withEntity("Too many connection attempts."))
        case Right(_) => for
          connected <- Deferred[IO, CoopPeer]
          fragments <- Ref.of[IO, Option[ByteVector]](None)
          protocol <- Queue.bounded[IO, WebSocketFrame](16)
          send = Stream.resource(runtime.connect).evalTap(peer => connected.complete(peer)).flatMap { peer =>
            peer.outgoing.mergeHaltL(Stream.fromQueueUnterminated(protocol))
          }
          receive: fs2.Pipe[IO, WebSocketFrame, Unit] = _.evalMap(frame => connected.get.flatMap { peer =>
            def invalid = runtime.shutdown(peer.id, CoopError("bad_message", "消息帧格式无效。", true))
            def deliver(bytes: ByteVector): IO[Unit] = bytes.decodeUtf8 match
              case Left(_) => invalid
              case Right(value) => runtime.receive(peer.id, value)
            def accept(bytes: ByteVector, last: Boolean): IO[Unit] =
              if bytes.size > CoopProtocol.MaxBytes then fragments.set(None) *>
                runtime.shutdown(peer.id, CoopError("message_too_large", "消息超过大小上限。", true, 1009))
              else if last then fragments.set(None) *> deliver(bytes)
              else fragments.set(Some(bytes))
            frame match
              case text: WebSocketFrame.Text => fragments.get.flatMap {
                case Some(_) => invalid
                case None => accept(text.data, text.last)
              }
              case continuation: WebSocketFrame.Continuation => fragments.get.flatMap {
                case Some(previous) => accept(previous ++ continuation.data, continuation.last)
                case None => invalid
              }
              case _: WebSocketFrame.Pong => runtime.touch(peer.id)
              case ping: WebSocketFrame.Ping => runtime.touch(peer.id) *>
                protocol.tryOffer(WebSocketFrame.Pong(ping.data)).flatMap(ok => if ok then IO.unit else
                  runtime.shutdown(peer.id, CoopError("rate_limited", "心跳过于频繁。", true)))
              case _: WebSocketFrame.Close => runtime.disconnect(peer.id)
              case _ => invalid
          })
          response <- builder.withDefragment(false).withFilterPingPongs(false)
            .withOnClose(connected.tryGet.flatMap(_.traverse_(peer => runtime.disconnect(peer.id))))
            .build(send, receive)
        yield response
      }
    }

  def allowedOrigins: Set[String] = sys.env.getOrElse("PDOOM_COOP_ORIGINS",
    "http://127.0.0.1:8080,http://localhost:8080").split(",").map(_.trim).filter(_.nonEmpty).toSet
