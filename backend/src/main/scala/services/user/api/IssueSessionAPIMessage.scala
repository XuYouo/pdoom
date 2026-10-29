package pdoom.services.user.api

import cats.effect.IO
import java.sql.Connection
import java.util.UUID
import pdoom.system.api.APIMessage
import pdoom.services.user.objects.{SessionId, User}
import pdoom.services.user.objects.apiTypes.{AuthResponse, UserProfile}
import pdoom.services.user.tables.usersession.UserSessionTable
import pdoom.services.user.utils.Tokens

// Internal only: not registered as a public HTTP action.
private[user] final case class IssueSessionAPIMessage(user: User) extends APIMessage[AuthResponse]:
  def plan(connection: Connection): IO[AuthResponse] =
    for
      token <- Tokens.generate
      digest <- Tokens.digest(token)
      sessionId <- IO.delay(SessionId(UUID.randomUUID()))
      now <- IO.realTimeInstant
      expiry = now.plusSeconds(60L * 60 * 24)
      _ <- UserSessionTable.insert(connection, sessionId, user.id, digest, now, expiry)
    yield AuthResponse(token, expiry.toString, UserProfile.fromDomain(user))
