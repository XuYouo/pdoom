package pdoom.services.game.objects.apiTypes

import io.circe.Codec
import io.circe.generic.semiauto.*

final case class SubmitScoreResponse(scoreId: String, personalBest: Boolean)
object SubmitScoreResponse:
  given Codec.AsObject[SubmitScoreResponse] = deriveCodec
