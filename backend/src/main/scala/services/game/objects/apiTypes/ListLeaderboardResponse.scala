package pdoom.services.game.objects.apiTypes

import io.circe.Codec
import io.circe.generic.semiauto.*

final case class ListLeaderboardResponse(entries: List[LeaderboardEntry], nextOffset: Option[Int])
object ListLeaderboardResponse:
  given Codec.AsObject[ListLeaderboardResponse] = deriveCodec
