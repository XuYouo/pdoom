package pdoom

import cats.effect.{IO, IOApp}
import com.comcast.ip4s.{Host, Port}
import org.http4s.ember.server.EmberServerBuilder
import pdoom.routes.ApiRouter
import pdoom.services.game.realtime.{CoopRoutes, CoopRuntime}
import pdoom.services.user.routes.UserRoutes
import pdoom.system.api.AttemptLimiter
import cats.data.Kleisli
import pdoom.system.{DatabaseConfig, DatabaseSession}

object Main extends IOApp.Simple:
  def run: IO[Unit] = for
    config <- DatabaseConfig.fromEnvironment
    host <- IO.fromOption(Host.fromString(sys.env.getOrElse("PDOOM_HOST", "127.0.0.1")))(
      new IllegalArgumentException("Invalid PDOOM_HOST"))
    port <- IO.fromOption(sys.env.getOrElse("PDOOM_PORT", "8081").toIntOption.flatMap(Port.fromInt))(
      new IllegalArgumentException("Invalid PDOOM_PORT"))
    _ <- DatabaseSession.resource(config).use { database =>
      for
        _ <- if sys.env.get("PDOOM_DB_INITIALIZE").contains("true") then DatabaseBootstrap.initialize(database) else IO.unit
        app <- ApiRouter.build(database)
        limiter <- AttemptLimiter.create()
        _ <- CoopRuntime.resource(
          token => database.withTransactionConnection(UserRoutes.resolveToken(_, token)),
          user => database.withTransactionConnection(UserRoutes.validateSession(_, user))).use { runtime =>
          EmberServerBuilder.default[IO].withHost(host).withPort(port).withHttpWebSocketApp { builder =>
            val realtime = CoopRoutes(runtime, builder, CoopRoutes.allowedOrigins, limiter)
            Kleisli(request => realtime.run(request).getOrElseF(app.run(request)))
          }.build.use { _ => IO.println(s"P(Doom) API and co-op listening on http://$host:$port") *> IO.never }
        }
      yield ()
    }
  yield ()
