package pdoom.services.user.utils

import cats.effect.IO
import java.security.{MessageDigest, SecureRandom}
import java.nio.charset.StandardCharsets
import java.util.{Base64, HexFormat}

private[user] object Tokens:
  def generate: IO[String] = IO.blocking {
    val bytes = new Array[Byte](32)
    new SecureRandom().nextBytes(bytes)
    Base64.getUrlEncoder.withoutPadding().encodeToString(bytes)
  }
  def digest(token: String): IO[String] = IO.blocking {
    HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)))
  }
