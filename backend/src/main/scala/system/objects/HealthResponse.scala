package pdoom.system.objects

import io.circe.Encoder
import io.circe.generic.semiauto.*

final case class HealthResponse(ok: Boolean)
object HealthResponse:
  given Encoder.AsObject[HealthResponse] = deriveEncoder
