package pdoom.services.user.utils

import cats.effect.IO
import java.security.{MessageDigest, SecureRandom}
import java.util.Base64
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec
import pdoom.services.user.objects.PasswordHash

private[user] object Passwords:
  val iterations = 600000
  // Same work for an unknown username, with a non-secret, deliberately invalid digest.
  val dummy = PasswordHash(Base64.getEncoder.encodeToString(new Array[Byte](16)),
    Base64.getEncoder.encodeToString(new Array[Byte](32)), iterations)

  private def derive(password: String, salt: Array[Byte], rounds: Int): Array[Byte] =
    val spec = new PBEKeySpec(password.toCharArray, salt, rounds, 256)
    try SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded
    finally spec.clearPassword()

  def hash(password: String): IO[PasswordHash] = IO.blocking {
    val salt = new Array[Byte](16)
    new SecureRandom().nextBytes(salt)
    PasswordHash(Base64.getEncoder.encodeToString(salt),
      Base64.getEncoder.encodeToString(derive(password, salt, iterations)), iterations)
  }

  def verify(password: String, stored: PasswordHash): IO[Boolean] = IO.blocking {
    MessageDigest.isEqual(Base64.getDecoder.decode(stored.digest),
      derive(password, Base64.getDecoder.decode(stored.salt), stored.iterations))
  }
