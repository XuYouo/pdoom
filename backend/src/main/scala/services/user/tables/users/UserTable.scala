package pdoom.services.user.tables.users

import cats.effect.IO
import java.sql.{Connection, ResultSet, Timestamp}
import java.time.Instant
import java.util.UUID
import scala.util.Using
import pdoom.services.user.objects.*

private[user] object UserTable:
  private final case class Row(id: UUID, username: String, salt: String, hash: String, iterations: Int):
    def toDomain: StoredUser = StoredUser(User(UserId(id), username), PasswordHash(salt, hash, iterations))
  private def read(result: ResultSet): StoredUser = Row(result.getObject("id", classOf[UUID]),
    result.getString("username"), result.getString("password_salt"), result.getString("password_hash"),
    result.getInt("password_iterations")).toDomain

  private val insertSql = """INSERT INTO users(id, username, username_key, password_salt, password_hash, password_iterations, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(username_key) DO NOTHING"""
  def insert(connection: Connection, user: User, key: String, password: PasswordHash, now: Instant): IO[Boolean] = IO.blocking {
    Using.resource(connection.prepareStatement(insertSql)) { statement =>
      statement.setObject(1, user.id.value); statement.setString(2, user.username); statement.setString(3, key)
      statement.setString(4, password.salt); statement.setString(5, password.digest)
      statement.setInt(6, password.iterations); statement.setTimestamp(7, Timestamp.from(now))
      statement.executeUpdate() == 1
    }
  }

  private val findByNameSql = "SELECT id, username, password_salt, password_hash, password_iterations FROM users WHERE username_key = ?"
  def findByName(connection: Connection, key: String): IO[Option[StoredUser]] = IO.blocking {
    Using.resource(connection.prepareStatement(findByNameSql)) { statement =>
      statement.setString(1, key)
      Using.resource(statement.executeQuery())(result => Option.when(result.next())(read(result)))
    }
  }

  private val findByIdSql = "SELECT id, username FROM users WHERE id = ?"
  def findById(connection: Connection, id: UserId): IO[Option[User]] = IO.blocking {
    Using.resource(connection.prepareStatement(findByIdSql)) { statement =>
      statement.setObject(1, id.value)
      Using.resource(statement.executeQuery())(result => Option.when(result.next())(
        User(UserId(result.getObject("id", classOf[UUID])), result.getString("username"))))
    }
  }
