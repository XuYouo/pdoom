package pdoom.services.user.api

import cats.effect.IO
import java.sql.Connection
import pdoom.system.{HttpError}
import pdoom.system.api.APIMessage
import pdoom.services.user.objects.apiTypes.ResolvedSessionResponse
import pdoom.services.user.tables.usersession.UserSessionTable
import pdoom.services.user.utils.Tokens

// Internal only. The HTTP router invokes this inside the same transaction as the use case.
final case class ResolveUserTokenAPIMessage(token: String) extends APIMessage[ResolvedSessionResponse]:
  def plan(connection: Connection): IO[ResolvedSessionResponse] =
    for
      hash <- Tokens.digest(token)
      now <- IO.realTimeInstant
      session <- UserSessionTable.resolve(connection, hash, now)
      authenticated <- IO.fromOption(session)(HttpError.Unauthorized)
    yield ResolvedSessionResponse(authenticated.userId.value.toString, authenticated.sessionId.value.toString)
