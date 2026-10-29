package pdoom.system.api

import cats.effect.IO
import java.sql.Connection

trait APIMessage[A]:
  def plan(connection: Connection): IO[A]

// Identity is supplied by the router, never decoded from the HTTP body.
// Kept generic/marker-only so system has no dependency on a business UserId.
trait APIWithTokenMessage[A] extends APIMessage[A]
trait NoRequestMessage[A] extends APIMessage[A]
