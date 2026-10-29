package pdoom.services.game.objects.apiTypes

import io.circe.Codec
import io.circe.generic.semiauto.*

final case class SaveGameResponse(revision: Long, updatedAt: String)
object SaveGameResponse:
  given Codec.AsObject[SaveGameResponse] = deriveCodec
