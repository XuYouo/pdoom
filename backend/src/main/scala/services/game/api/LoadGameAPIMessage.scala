package pdoom.services.game.api

import cats.effect.IO
import java.sql.Connection
import pdoom.system.api.{APIWithTokenMessage, NoRequestMessage}
import pdoom.services.user.objects.UserId
import pdoom.services.game.objects.apiTypes.{GameSaveData, LoadGameResponse}
import pdoom.services.game.tables.gamesave.GameSaveTable
import pdoom.services.game.utils.ValidateGame

final case class LoadGameAPIMessage(userId: UserId)
    extends APIWithTokenMessage[LoadGameResponse] with NoRequestMessage[LoadGameResponse]:
  def plan(connection: Connection): IO[LoadGameResponse] =
    GameSaveTable.find(connection, userId).flatMap {
      case None => IO.pure(LoadGameResponse(None, 0, None))
      case Some(stored) => IO.fromEither(ValidateGame.save(stored.save)
        .left.map(_ => new IllegalStateException("Invalid persisted save"))).map { save =>
          LoadGameResponse(Some(GameSaveData.fromDomain(save)), stored.revision, Some(stored.updatedAt.toString))
        }
    }
