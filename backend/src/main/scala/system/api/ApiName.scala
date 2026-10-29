package pdoom.system.api

import cats.effect.IO
import io.circe.parser.decode
import scala.io.Source
import scala.util.Using

object ApiName:
  def load: IO[Map[String, String]] = IO.blocking {
    val stream = Option(getClass.getResourceAsStream("/contracts/api.json"))
      .getOrElse(throw new IllegalStateException("Missing shared API registry"))
    val content = Using.resource(Source.fromInputStream(stream, "UTF-8"))(_.mkString)
    val entries = decode[Map[String, String]](content).fold(throw _, identity)
    require(entries.values.toSet.size == entries.size, "Duplicate API routes")
    require(entries.forall { case (_, path) => path.matches("[a-z]+api") }, "Invalid API route")
    entries
  }
