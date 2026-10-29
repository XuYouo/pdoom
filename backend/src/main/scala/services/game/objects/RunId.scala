package pdoom.services.game.objects

import io.circe.{Decoder, Encoder}
import java.util.UUID
import scala.util.Try

final case class RunId(value: UUID)
object RunId:
  def parse(value: String): Either[String, RunId] =
    Try(UUID.fromString(value)).toEither.left.map(_ => "runId must be a UUID.")
      .flatMap(id => Either.cond(id.toString.equalsIgnoreCase(value), RunId(id), "runId must be a canonical UUID."))
  given Encoder[RunId] = Encoder.encodeString.contramap(_.value.toString)
  given Decoder[RunId] = Decoder.decodeString.emap(parse)
