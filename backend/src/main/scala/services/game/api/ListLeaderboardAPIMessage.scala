package pdoom.services.game.api

import cats.effect.IO
import java.sql.Connection
import pdoom.system.HttpError
import pdoom.system.api.APIMessage
import pdoom.services.game.objects.apiTypes.{LeaderboardEntry, ListLeaderboardResponse}
import pdoom.services.game.tables.gamescore.GameScoreTable
import pdoom.services.game.utils.ValidateGame

final case class ListLeaderboardAPIMessage(limit: Int, offset: Int) extends APIMessage[ListLeaderboardResponse]:
  def plan(connection: Connection): IO[ListLeaderboardResponse] =
    for
      _ <- IO.fromEither(HttpError.fromValidation(ValidateGame.pagination(limit, offset)))
      records <- GameScoreTable.list(connection, limit + 1, offset)
    yield ListLeaderboardResponse(records.take(limit).zipWithIndex.map { case (entry, index) =>
      LeaderboardEntry.fromDomain(entry, offset + index + 1)
    }, Option.when(records.size > limit && offset + limit <= 10000)(offset + limit))
