package pdoom.services.user.objects.apiTypes

import io.circe.Codec
import io.circe.generic.semiauto.*

final case class GetCurrentUserResponse(user: UserProfile)
object GetCurrentUserResponse:
  given Codec.AsObject[GetCurrentUserResponse] = deriveCodec
