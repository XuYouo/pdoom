package pdoom.services.user.objects.apiTypes

import io.circe.Codec
import io.circe.generic.semiauto.*

final case class AuthResponse(token: String, expiresAt: String, user: UserProfile)
object AuthResponse:
  given Codec.AsObject[AuthResponse] = deriveCodec
