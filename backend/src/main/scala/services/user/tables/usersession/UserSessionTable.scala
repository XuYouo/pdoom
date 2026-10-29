package pdoom.services.user.tables.usersession

import cats.effect.IO
import java.sql.{Connection, Timestamp}
import java.time.Instant
import java.util.UUID
import scala.util.Using
import pdoom.services.user.objects.*

private[user] object UserSessionTable:
  private val insertSql = "INSERT INTO user_sessions(id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
  def insert(connection: Connection, id: SessionId, userId: UserId, hash: String, now: Instant, expiry: Instant): IO[Unit] = IO.blocking {
    Using.resource(connection.prepareStatement(insertSql)) { statement =>
      statement.setObject(1, id.value); statement.setObject(2, userId.value); statement.setString(3, hash)
      statement.setTimestamp(4, Timestamp.from(now)); statement.setTimestamp(5, Timestamp.from(expiry))
      statement.executeUpdate(); ()
    }
  }

  // A request holds the session row until commit, so logout cannot overtake an already authorized write.
  private val resolveSql = """SELECT id, user_id FROM user_sessions
    WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ? FOR UPDATE"""
  def resolve(connection: Connection, hash: String, now: Instant): IO[Option[AuthenticatedUser]] = IO.blocking {
    Using.resource(connection.prepareStatement(resolveSql)) { statement =>
      statement.setString(1, hash); statement.setTimestamp(2, Timestamp.from(now))
      Using.resource(statement.executeQuery())(result => Option.when(result.next())(
        AuthenticatedUser(UserId(result.getObject("user_id", classOf[UUID])), SessionId(result.getObject("id", classOf[UUID])))))
    }
  }

  private val revokeSql = "UPDATE user_sessions SET revoked_at = ? WHERE id = ? AND user_id = ?"
  def revoke(connection: Connection, userId: UserId, sessionId: SessionId, now: Instant): IO[Unit] = IO.blocking {
    Using.resource(connection.prepareStatement(revokeSql)) { statement =>
      statement.setTimestamp(1, Timestamp.from(now)); statement.setObject(2, sessionId.value)
      statement.setObject(3, userId.value); statement.executeUpdate(); ()
    }
  }
