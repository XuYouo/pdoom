package pdoom.services.user.objects.apiTypes

import io.circe.{Codec, Encoder, Decoder}
import io.circe.generic.semiauto.*
import pdoom.services.user.objects.User

final case class UserProfile(id: String, username: String)
object UserProfile:
  given Codec.AsObject[UserProfile] = deriveCodec
  def fromDomain(user: User): UserProfile = UserProfile(user.id.value.toString, user.username)
