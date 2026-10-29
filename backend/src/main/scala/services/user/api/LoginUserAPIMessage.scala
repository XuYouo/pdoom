package pdoom.services.user.api

import cats.effect.IO
import java.sql.Connection
import pdoom.system.HttpError
import pdoom.system.api.APIMessage
import pdoom.services.user.objects.apiTypes.AuthResponse
import pdoom.services.user.tables.users.UserTable
import pdoom.services.user.utils.{Passwords, ValidateCredentials}

final case class LoginUserAPIMessage(username: String, password: String) extends APIMessage[AuthResponse]:
  def plan(connection: Connection): IO[AuthResponse] =
    for
      key <- IO.fromEither(ValidateCredentials.username(username).left.map(_ => HttpError.Unauthorized))
      _ <- IO.raiseUnless(password.nonEmpty && password.length <= 128)(HttpError.Unauthorized)
      stored <- UserTable.findByName(connection, key)
      valid <- Passwords.verify(password, stored.map(_.password).getOrElse(Passwords.dummy))
      user <- IO.fromOption(stored.filter(_ => valid).map(_.user))(HttpError.Unauthorized)
      response <- IssueSessionAPIMessage(user).plan(connection)
    yield response
