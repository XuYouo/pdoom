package pdoom.services.user.objects.apiTypes

import io.circe.Codec
import io.circe.generic.semiauto.*

final case class CredentialsRequest(username: String, password: String)
object CredentialsRequest:
  given Codec.AsObject[CredentialsRequest] = deriveCodec
