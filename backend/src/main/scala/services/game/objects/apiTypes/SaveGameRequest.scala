package pdoom.services.game.objects.apiTypes

import io.circe.Codec
import io.circe.generic.semiauto.*

final case class SaveGameRequest(save: GameSaveData, expectedRevision: Long)
object SaveGameRequest:
  given Codec.AsObject[SaveGameRequest] = deriveCodec
