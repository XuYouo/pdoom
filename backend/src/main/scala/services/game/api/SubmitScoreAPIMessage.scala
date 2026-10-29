package pdoom.services.game.api

import cats.effect.IO
import java.sql.Connection
import java.util.UUID
import pdoom.system.HttpError
import pdoom.system.api.APIWithTokenMessage
import pdoom.services.user.objects.UserId
import pdoom.services.user.api.GetCurrentUserAPIMessage
import pdoom.services.game.objects.{ScoreId, ScoreRecord}
import pdoom.services.game.objects.apiTypes.{SubmitScoreRequest, SubmitScoreResponse}
import pdoom.services.game.tables.gamescore.GameScoreTable
import pdoom.services.game.utils.ValidateGame

final case class SubmitScoreAPIMessage(userId: UserId, input: SubmitScoreRequest)
    extends APIWithTokenMessage[SubmitScoreResponse]:
  def plan(connection: Connection): IO[SubmitScoreResponse] =
    for
      domain <- IO.fromEither(HttpError.fromValidation(input.toDomain.flatMap(ValidateGame.score)))
      // Cross-service reads go through the public user API on this same connection.
      current <- GetCurrentUserAPIMessage(userId).plan(connection)
      _ <- GameScoreTable.lockUserScores(connection, userId)
      existing <- GameScoreTable.find(connection, userId, domain.runId)
      record <- existing match
        case Some(previous) =>
          IO.raiseUnless(previous.submission == domain)(HttpError.Conflict("runId already has a different result."))
            .as(previous)
        case None =>
          for
            best <- GameScoreTable.best(connection, userId)
            id <- IO.delay(ScoreId(UUID.randomUUID()))
            now <- IO.realTimeInstant
            value = ScoreRecord(id, domain, current.user.username, best.forall(domain.score > _), now)
            _ <- GameScoreTable.insert(connection, userId, value)
          yield value
    yield SubmitScoreResponse(record.id.value.toString, record.personalBest)
