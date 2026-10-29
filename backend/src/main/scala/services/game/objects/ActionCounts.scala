package pdoom.services.game.objects

import io.circe.Codec
import io.circe.generic.semiauto.*

final case class ActionCounts(shots: Int, dashes: Int, rewinds: Int, insights: Int)
object ActionCounts:
  given Codec.AsObject[ActionCounts] = deriveCodec
