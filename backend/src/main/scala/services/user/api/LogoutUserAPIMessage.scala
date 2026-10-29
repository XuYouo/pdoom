package pdoom.services.user.api

import cats.effect.IO
import java.sql.Connection
import pdoom.system.api.{APIWithTokenMessage, NoRequestMessage}
import pdoom.services.user.objects.{SessionId, UserId}
import pdoom.services.user.objects.apiTypes.LogoutResponse
import pdoom.services.user.tables.usersession.UserSessionTable

final case class LogoutUserAPIMessage(userId: UserId, sessionId: SessionId)
    extends APIWithTokenMessage[LogoutResponse] with NoRequestMessage[LogoutResponse]:
  def plan(connection: Connection): IO[LogoutResponse] =
    IO.realTimeInstant.flatMap(now => UserSessionTable.revoke(connection, userId, sessionId, now)).as(LogoutResponse(true))
