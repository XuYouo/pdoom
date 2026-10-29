package pdoom.services.game.api

import cats.effect.IO
import java.sql.Connection
import pdoom.system.HttpError
import pdoom.system.api.APIWithTokenMessage
import pdoom.services.user.objects.UserId
import pdoom.services.game.objects.apiTypes.{GameSaveData, SaveGameResponse}
import pdoom.services.game.tables.gamesave.GameSaveTable
import pdoom.services.game.utils.ValidateGame

final case class SaveGameAPIMessage(userId: UserId, save: GameSaveData, expectedRevision: Long)
    extends APIWithTokenMessage[SaveGameResponse]:
  def plan(connection: Connection): IO[SaveGameResponse] =
    for
      _ <- IO.raiseUnless(expectedRevision >= 0 && expectedRevision < 9007199254740991L)(
        HttpError.BadRequest("expectedRevision must be a non-negative safe integer."))
      domain <- IO.fromEither(HttpError.fromValidation(save.toDomain.flatMap(ValidateGame.save)))
      now <- IO.realTimeInstant
      written <- if expectedRevision == 0 then GameSaveTable.insert(connection, userId, domain, now)
        else GameSaveTable.update(connection, userId, domain, expectedRevision, now)
      stored <- IO.fromOption(written)(HttpError.Conflict("Save revision changed. Load the latest save before retrying."))
    yield SaveGameResponse(stored.revision, stored.updatedAt.toString)
