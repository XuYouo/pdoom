package pdoom.services.user.routes

import cats.effect.IO
import java.sql.Connection
import java.util.UUID
import pdoom.system.api.RegisteredAPIMessage
import pdoom.services.user.api.*
import pdoom.services.user.objects.*
import pdoom.services.user.objects.apiTypes.*

object UserRoutes:
  val apiMessages: List[RegisteredAPIMessage[AuthenticatedUser]] = List(
    RegisteredAPIMessage.public[AuthenticatedUser, CredentialsRequest, AuthResponse]("RegisterUser", true)(
      input => RegisterUserAPIMessage(input.username, input.password)),
    RegisteredAPIMessage.public[AuthenticatedUser, CredentialsRequest, AuthResponse]("LoginUser", true)(
      input => LoginUserAPIMessage(input.username, input.password)),
    RegisteredAPIMessage.authenticatedEmpty[AuthenticatedUser, LogoutResponse]("LogoutUser")(
      caller => LogoutUserAPIMessage(caller.userId, caller.sessionId)),
    RegisteredAPIMessage.authenticatedEmpty[AuthenticatedUser, GetCurrentUserResponse]("GetCurrentUser")(
      caller => GetCurrentUserAPIMessage(caller.userId))
  )

  def resolveToken(connection: Connection, token: String): IO[AuthenticatedUser] =
    ResolveUserTokenAPIMessage(token).plan(connection).map { trusted =>
      AuthenticatedUser(UserId(UUID.fromString(trusted.userId)), SessionId(UUID.fromString(trusted.sessionId)))
    }
