package pdoom.system

import cats.effect.{IO, Resource}
import com.zaxxer.hikari.{HikariConfig, HikariDataSource}
import java.sql.Connection

final class DatabaseSession private (pool: HikariDataSource):
  def withTransactionConnection[A](use: Connection => IO[A]): IO[A] =
    Resource.make(IO.blocking(pool.getConnection))(connection => IO.blocking(connection.close())).use { connection =>
      // Commit/rollback are uncancelable; cancellation of a use always rolls back before close.
      IO.uncancelable { poll =>
        poll(IO.defer(use(connection))).onCancel(IO.blocking(connection.rollback())).attempt.flatMap {
          case Right(value) => IO.blocking(connection.commit()).as(value)
            .onError { case _ => IO.blocking(connection.rollback()) }
          case Left(error) => IO.blocking(connection.rollback()).attempt *> IO.raiseError[A](error)
        }
      }
    }

object DatabaseSession:
  def resource(config: DatabaseConfig): Resource[IO, DatabaseSession] =
    Resource.make(IO.blocking {
      val settings = new HikariConfig()
      settings.setJdbcUrl(config.url)
      settings.setUsername(config.user)
      settings.setPassword(config.password)
      settings.setAutoCommit(false)
      settings.setMaximumPoolSize(8)
      settings.setMinimumIdle(0)
      settings.setConnectionTimeout(5000)
      settings.setPoolName("pdoom")
      settings.addDataSourceProperty("connectTimeout", "5")
      settings.addDataSourceProperty("socketTimeout", "30")
      settings.addDataSourceProperty("options", "-c statement_timeout=15000 -c lock_timeout=10000")
      new HikariDataSource(settings)
    })(pool => IO.blocking(pool.close())).map(new DatabaseSession(_))
