package pdoom.services.user.api

import cats.effect.IO
import java.sql.Connection
import java.util.UUID
import pdoom.system.HttpError
import pdoom.system.api.APIMessage
import pdoom.services.user.objects.{User, UserId}
import pdoom.services.user.objects.apiTypes.AuthResponse
import pdoom.services.user.tables.users.UserTable
import pdoom.services.user.utils.{Passwords, ValidateCredentials}

final case class RegisterUserAPIMessage(username: String, password: String) extends APIMessage[AuthResponse]:
  def plan(connection: Connection): IO[AuthResponse] =
    for
      key <- IO.fromEither(HttpError.fromValidation(ValidateCredentials.username(username)))
      _ <- IO.fromEither(HttpError.fromValidation(ValidateCredentials.password(password)))
      hash <- Passwords.hash(password)
      id <- IO.delay(UserId(UUID.randomUUID()))
      now <- IO.realTimeInstant
      user = User(id, username)
      inserted <- UserTable.insert(connection, user, key, hash, now)
      _ <- IO.raiseUnless(inserted)(HttpError.Conflict("Username is unavailable."))
      response <- IssueSessionAPIMessage(user).plan(connection)
    yield response
