package pdoom.system.api

import cats.effect.IO
import cats.syntax.all.*
import io.circe.Json
import io.circe.parser.parse
import org.http4s.{HttpApp, MediaType, Method, Request, Response, Status}
import org.http4s.circe.*
import org.typelevel.ci.CIString
import pdoom.system.{DatabaseSession, HttpError}
import java.sql.Connection
import java.util.UUID
import java.nio.charset.StandardCharsets

final class APIMessageRouter[I](
    database: DatabaseSession,
    registry: Map[String, String],
    registrations: List[RegisteredAPIMessage[I]],
    resolveToken: (Connection, String) => IO[I],
    limiter: AttemptLimiter
):
  require(registrations.map(_.action).distinct.size == registrations.size, "Duplicate actions")
  require(registrations.map(_.action).toSet == registry.keySet, "API registry/implementation mismatch")
  private val routes = registrations.map(item => registry(item.action) -> item).toMap
  private val maximumBytes = 65536

  private def validateStructure(json: Json): Either[HttpError, Unit] =
    @scala.annotation.tailrec
    def loop(pending: List[(Json, Int)]): Either[HttpError, Unit] = pending match
      case Nil => Right(())
      case (_, depth) :: _ if depth > 32 => Left(HttpError.BadRequest("JSON nesting exceeds 32 levels."))
      case (value, depth) :: rest => value.asObject match
        case Some(obj) if obj.keys.exists(key => key == "userId" || key == "role") =>
          Left(HttpError.BadRequest("Client identity fields are not accepted."))
        case Some(obj) => loop(obj.values.toList.map(_ -> (depth + 1)) ::: rest)
        case None => loop(value.asArray.toList.flatten.map(_ -> (depth + 1)) ::: rest)
    loop(List(json -> 0))

  private def body(request: Request[IO]): IO[Json] =
    for
      _ <- IO.raiseUnless(request.contentType.exists(_.mediaType == MediaType.application.json))(
        HttpError.BadRequest("Content-Type must be application/json."))
      bytes <- request.body.take(maximumBytes.toLong + 1).compile.to(Array)
      _ <- IO.raiseWhen(bytes.length > maximumBytes)(HttpError.BadRequest("Request exceeds 64 KiB."))
      json <- IO.fromEither(parse(new String(bytes, StandardCharsets.UTF_8))
        .left.map(_ => HttpError.BadRequest("Invalid JSON.")))
      _ <- IO.raiseUnless(json.isObject)(HttpError.BadRequest("Expected a JSON object."))
      _ <- IO.fromEither(validateStructure(json))
    yield json

  private def bearer(request: Request[IO]): IO[String] =
    val headers = request.headers.headers.filter(_.name == CIString("Authorization"))
    val token = headers match
      case header :: Nil if header.value.startsWith("Bearer ") => Some(header.value.drop(7))
      case _ => None
    IO.fromOption(token.filter(_.matches("[A-Za-z0-9_-]{43}")))(HttpError.Unauthorized)

  val app: HttpApp[IO] = cats.data.Kleisli { request =>
    IO.delay(UUID.randomUUID().toString).flatMap { requestId =>
      val operation = for
        endpoint <- IO.fromOption(
          Option.when(request.method == Method.POST)(request.uri.path.renderString.stripPrefix("/api/"))
            .filter(_ => request.uri.path.renderString.startsWith("/api/")).flatMap(routes.get)
        )(HttpError.NotFound)
        _ <- if endpoint.rateLimited then limiter.check(request.remoteAddr.map(_.toString).getOrElse("unknown")) else IO.unit
        payload <- body(request)
        result <- database.withTransactionConnection { connection =>
          for
            caller <- if endpoint.requiresToken then bearer(request).flatMap(resolveToken(connection, _)).map(Some(_))
              else IO.pure(None)
            json <- endpoint.invoke(payload, caller, connection)
          yield json
        }
      yield Response[IO](Status.Ok).withEntity(result)

      operation.handleErrorWith { error =>
        val safe = HttpError.safe(error)
        val log = if safe == HttpError.Internal then
          // No message/SQL/body/token is logged. The correlation ID is safe to expose.
          IO.println(s"request_failed requestId=$requestId exception=${error.getClass.getSimpleName}")
        else IO.unit
        log.as(Response[IO](Status.fromInt(safe.status).getOrElse(Status.InternalServerError)).withEntity(Json.obj(
          "code" -> Json.fromString(safe.code), "message" -> Json.fromString(safe.publicMessage),
          "requestId" -> Json.fromString(requestId)
        )))
      }.map(_.putHeaders(
        org.http4s.Header.Raw(CIString("X-Request-Id"), requestId),
        org.http4s.Header.Raw(CIString("Cache-Control"), "no-store"),
        org.http4s.Header.Raw(CIString("X-Content-Type-Options"), "nosniff")
      ))
    }
  }
