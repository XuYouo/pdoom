package pdoom.routes

import cats.effect.IO
import io.circe.syntax.*
import org.http4s.{Header, HttpRoutes, Method, Response, Status}
import org.http4s.circe.*
import org.typelevel.ci.CIString
import pdoom.system.DatabaseSession
import pdoom.system.objects.HealthResponse

object HealthRouter:
  def routes(database: DatabaseSession): HttpRoutes[IO] = HttpRoutes.of[IO] {
    case request if request.method == Method.GET && request.uri.path.renderString == "/health" =>
      database.withTransactionConnection(connection => IO.blocking(connection.isValid(2))).attempt.map { result =>
        val healthy = result.toOption.contains(true)
        Response[IO](if healthy then Status.Ok else Status.ServiceUnavailable)
          .withEntity(HealthResponse(healthy).asJson)
          .putHeaders(Header.Raw(CIString("Cache-Control"), "no-store"))
      }
  }
