package pdoom.services.user.utils

import java.util.Locale

private[user] object ValidateCredentials:
  def username(value: String): Either[String, String] =
    Either.cond(value.matches("[A-Za-z0-9_]{3,32}"), value.toLowerCase(Locale.ROOT),
      "Username must contain 3–32 ASCII letters, digits or underscores.")
  def password(value: String): Either[String, String] =
    Either.cond(value.length >= 10 && value.length <= 128, value, "Password must contain 10–128 characters.")
