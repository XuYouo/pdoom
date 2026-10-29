package pdoom.services.game.objects.apiTypes

import io.circe.Codec
import io.circe.generic.semiauto.*

final case class ListLeaderboardRequest(limit: Int, offset: Int)
object ListLeaderboardRequest:
  given Codec.AsObject[ListLeaderboardRequest] = deriveCodec
