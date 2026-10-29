package pdoom.services.game.objects.apiTypes

import io.circe.Codec
import io.circe.generic.semiauto.*
import pdoom.services.game.objects.ActionCounts

final case class ActionCountsData(shots: Int, dashes: Int, rewinds: Int, insights: Int):
  def toDomain: ActionCounts = ActionCounts(shots, dashes, rewinds, insights)
object ActionCountsData:
  given Codec.AsObject[ActionCountsData] = deriveCodec
  def fromDomain(value: ActionCounts): ActionCountsData = ActionCountsData(value.shots, value.dashes, value.rewinds, value.insights)
