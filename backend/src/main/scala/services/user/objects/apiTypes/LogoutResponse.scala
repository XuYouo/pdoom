package pdoom.services.user.objects.apiTypes

import io.circe.Codec
import io.circe.generic.semiauto.*

final case class LogoutResponse(loggedOut: Boolean)
object LogoutResponse:
  given Codec.AsObject[LogoutResponse] = deriveCodec
