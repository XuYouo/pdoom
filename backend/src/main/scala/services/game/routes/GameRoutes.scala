package pdoom.services.game.routes

import pdoom.system.api.RegisteredAPIMessage
import pdoom.services.user.objects.AuthenticatedUser
import pdoom.services.game.api.*
import pdoom.services.game.objects.apiTypes.*

object GameRoutes:
  val apiMessages: List[RegisteredAPIMessage[AuthenticatedUser]] = List(
    RegisteredAPIMessage.authenticatedEmpty[AuthenticatedUser, LoadGameResponse]("LoadGame")(
      caller => LoadGameAPIMessage(caller.userId)),
    RegisteredAPIMessage.authenticated[AuthenticatedUser, SaveGameRequest, SaveGameResponse]("SaveGame")(
      (caller, input) => SaveGameAPIMessage(caller.userId, input.save, input.expectedRevision)),
    RegisteredAPIMessage.authenticated[AuthenticatedUser, SubmitScoreRequest, SubmitScoreResponse]("SubmitScore")(
      (caller, input) => SubmitScoreAPIMessage(caller.userId, input)),
    RegisteredAPIMessage.public[AuthenticatedUser, ListLeaderboardRequest, ListLeaderboardResponse]("ListLeaderboard")(
      input => ListLeaderboardAPIMessage(input.limit, input.offset))
  )
