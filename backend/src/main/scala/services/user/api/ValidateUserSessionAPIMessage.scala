package pdoom.services.user.api

import cats.effect.IO
import java.sql.Connection
import pdoom.services.user.objects.AuthenticatedUser
import pdoom.services.user.tables.usersession.UserSessionTable
import pdoom.system.HttpError
import pdoom.system.api.APIMessage

/** Internal session revalidation for long-lived transports; never registered as an HTTP action. */
final case class ValidateUserSessionAPIMessage(user: AuthenticatedUser) extends APIMessage[Unit]:
  def plan(connection: Connection): IO[Unit] = for
    now <- IO.realTimeInstant
    active <- UserSessionTable.isActive(connection, user, now)
    _ <- IO.raiseUnless(active)(HttpError.Unauthorized)
  yield ()
