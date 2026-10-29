package pdoom.services.user.objects

final case class PasswordHash(salt: String, digest: String, iterations: Int)
