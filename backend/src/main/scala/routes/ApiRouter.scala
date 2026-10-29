package pdoom.routes

import cats.effect.IO
import org.http4s.HttpApp
import pdoom.system.DatabaseSession
import pdoom.system.api.{APIMessageRouter, ApiName, AttemptLimiter}
import pdoom.services.user.routes.UserRoutes
import pdoom.services.game.routes.GameRoutes

object ApiRouter:
  def build(database: DatabaseSession): IO[HttpApp[IO]] =
    for
      registry <- ApiName.load
      limiter <- AttemptLimiter.create()
    yield
      val api = new APIMessageRouter(database, registry, UserRoutes.apiMessages ++ GameRoutes.apiMessages,
        UserRoutes.resolveToken, limiter).app
      val health = HealthRouter.routes(database)
      cats.data.Kleisli(request => health.run(request).getOrElseF(api.run(request)))
