package pdoom.services.user.api

import cats.effect.IO
import java.sql.Connection
import pdoom.system.HttpError
import pdoom.system.api.{APIWithTokenMessage, NoRequestMessage}
import pdoom.services.user.objects.UserId
import pdoom.services.user.objects.apiTypes.{GetCurrentUserResponse, UserProfile}
import pdoom.services.user.tables.users.UserTable

final case class GetCurrentUserAPIMessage(userId: UserId)
    extends APIWithTokenMessage[GetCurrentUserResponse] with NoRequestMessage[GetCurrentUserResponse]:
  def plan(connection: Connection): IO[GetCurrentUserResponse] =
    UserTable.findById(connection, userId).flatMap(value => IO.fromOption(value)(HttpError.Unauthorized))
      .map(user => GetCurrentUserResponse(UserProfile.fromDomain(user)))
