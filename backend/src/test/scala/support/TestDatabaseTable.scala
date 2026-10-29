package pdoom.tests.support

import cats.effect.IO
import java.sql.Connection
import scala.util.Using

// Test-only probes. Never registered in production. All operations target the freshly created pdoom_test DB.
object TestDatabaseTable:
  def createSchema(connection: Connection, name: String): IO[Unit] = IO.blocking {
    // PostgreSQL cannot bind identifiers. This name is generated internally and allowlisted, never HTTP input.
    require(name.matches("pdoom_test_[a-f0-9]{32}"))
    Using.resource(connection.prepareStatement("CREATE SCHEMA \"" + name + "\""))(_.executeUpdate()); ()
  }

  private val countSql = "SELECT count(*) FROM users WHERE username_key = ?"
  def countUsers(connection: Connection, username: String): IO[Long] = IO.blocking {
    Using.resource(connection.prepareStatement(countSql)) { statement =>
      statement.setString(1, username.toLowerCase(java.util.Locale.ROOT))
      Using.resource(statement.executeQuery()) { result => result.next(); result.getLong(1) }
    }
  }

  private val hashesSql = """SELECT u.password_salt, u.password_hash, u.password_iterations, s.token_hash
    FROM users u JOIN user_sessions s ON s.user_id = u.id WHERE u.username_key = ?"""
  def hashes(connection: Connection, username: String): IO[List[(String, String, Int, String)]] = IO.blocking {
    Using.resource(connection.prepareStatement(hashesSql)) { statement =>
      statement.setString(1, username.toLowerCase(java.util.Locale.ROOT))
      Using.resource(statement.executeQuery()) { result =>
        Iterator.continually(result.next()).takeWhile(identity).map(_ =>
          (result.getString(1), result.getString(2), result.getInt(3), result.getString(4))).toList
      }
    }
  }

  private val expireSql = """UPDATE user_sessions SET created_at = now() - interval '2 days', expires_at = now() - interval '1 second'
    WHERE user_id IN (SELECT id FROM users WHERE username_key = ?)"""
  def expire(connection: Connection, username: String): IO[Unit] = IO.blocking {
    Using.resource(connection.prepareStatement(expireSql)) { statement =>
      statement.setString(1, username.toLowerCase(java.util.Locale.ROOT)); statement.executeUpdate(); ()
    }
  }

  private val scoresSql = "SELECT count(*) FROM game_scores WHERE run_id = ?::uuid"
  def scoreCount(connection: Connection, runId: String): IO[Long] = IO.blocking {
    Using.resource(connection.prepareStatement(scoresSql)) { statement =>
      statement.setString(1, runId)
      Using.resource(statement.executeQuery()) { result => result.next(); result.getLong(1) }
    }
  }
