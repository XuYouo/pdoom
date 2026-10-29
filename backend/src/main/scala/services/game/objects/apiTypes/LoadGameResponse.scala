package pdoom.services.game.objects.apiTypes

import io.circe.Codec
import io.circe.generic.semiauto.*

final case class LoadGameResponse(save: Option[GameSaveData], revision: Long, updatedAt: Option[String])
object LoadGameResponse:
  given Codec.AsObject[LoadGameResponse] = deriveCodec
