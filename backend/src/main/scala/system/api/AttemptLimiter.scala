package pdoom.system.api

import cats.effect.{IO, Ref}
import pdoom.system.HttpError
import scala.concurrent.duration.*

final class AttemptLimiter private (state: Ref[IO, Map[String, (Long, Int)]], maximum: Int, window: FiniteDuration):
  def check(key: String): IO[Unit] =
    IO.monotonic.flatMap { time =>
      val now = time.toMillis
      state.modify { old =>
        val active = old.filter { case (_, (start, _)) => now - start < window.toMillis }
        val (start, count) = active.getOrElse(key, (now, 0))
        // Bound memory, fail closed when a window has too many distinct peers.
        if count >= maximum || (!active.contains(key) && active.size >= 4096) then (active, false)
        else (active.updated(key, (start, count + 1)), true)
      }.flatMap(allowed => IO.raiseUnless(allowed)(HttpError.RateLimited))
    }

object AttemptLimiter:
  def create(maximum: Int = 20, window: FiniteDuration = 1.minute): IO[AttemptLimiter] =
    Ref.of[IO, Map[String, (Long, Int)]](Map.empty).map(new AttemptLimiter(_, maximum, window))
