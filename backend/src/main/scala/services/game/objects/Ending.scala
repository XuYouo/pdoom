package pdoom.services.game.objects

import io.circe.{Decoder, Encoder}

enum Ending(val value: String):
  case Defeat extends Ending("defeat")
  case Aligned extends Ending("aligned")
  case Warden extends Ending("warden")
  case Foom extends Ending("foom")

object Ending:
  def parse(value: String): Either[String, Ending] = values.find(_.value == value).toRight("Unknown ending.")
  given Encoder[Ending] = Encoder.encodeString.contramap(_.value)
  given Decoder[Ending] = Decoder.decodeString.emap(parse)
