package pdoom.services.game.objects.apiTypes

import io.circe.Codec
import io.circe.generic.semiauto.*
import pdoom.services.game.objects.{Ending, RunId, ScoreSubmission}

final case class SubmitScoreRequest(runId: String, score: Int, stage: Int, durationMs: Int, doom: Double, ending: String):
  def toDomain: Either[String, ScoreSubmission] = for
    id <- RunId.parse(runId)
    end <- Ending.parse(ending)
  yield ScoreSubmission(id, score, stage, durationMs, doom, end)
object SubmitScoreRequest:
  given Codec.AsObject[SubmitScoreRequest] = deriveCodec
