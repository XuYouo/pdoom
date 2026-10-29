package pdoom.services.game.tables.gamesave

import cats.effect.IO
import io.circe.parser.decode
import io.circe.syntax.*
import java.sql.{Connection, ResultSet, Timestamp}
import java.time.Instant
import scala.util.Using
import pdoom.services.user.objects.UserId
import pdoom.services.game.objects.{GameSave, SavedGame}

private[game] object GameSaveTable:
  private final case class Row(data: String, revision: Long, updatedAt: Instant):
    def toDomain: SavedGame = SavedGame(decode[GameSave](data).fold(throw _, identity), revision, updatedAt)
  private def read(result: ResultSet): SavedGame = Row(result.getString("save_data"), result.getLong("revision"),
    result.getTimestamp("updated_at").toInstant).toDomain

  private val findSql = "SELECT save_data, revision, updated_at FROM game_saves WHERE user_id = ?"
  def find(connection: Connection, userId: UserId): IO[Option[SavedGame]] = IO.blocking {
    Using.resource(connection.prepareStatement(findSql)) { statement =>
      statement.setObject(1, userId.value)
      Using.resource(statement.executeQuery())(result => Option.when(result.next())(read(result)))
    }
  }

  private val insertSql = """INSERT INTO game_saves(user_id, save_data, revision, created_at, updated_at)
    VALUES (?, ?::jsonb, 1, ?, ?) ON CONFLICT(user_id) DO NOTHING RETURNING save_data, revision, updated_at"""
  def insert(connection: Connection, userId: UserId, save: GameSave, now: Instant): IO[Option[SavedGame]] = IO.blocking {
    Using.resource(connection.prepareStatement(insertSql)) { statement =>
      statement.setObject(1, userId.value); statement.setString(2, save.asJson.noSpaces)
      statement.setTimestamp(3, Timestamp.from(now)); statement.setTimestamp(4, Timestamp.from(now))
      Using.resource(statement.executeQuery())(result => Option.when(result.next())(read(result)))
    }
  }

  private val updateSql = """UPDATE game_saves SET save_data = ?::jsonb, revision = revision + 1, updated_at = ?
    WHERE user_id = ? AND revision = ? RETURNING save_data, revision, updated_at"""
  def update(connection: Connection, userId: UserId, save: GameSave, expectedRevision: Long, now: Instant): IO[Option[SavedGame]] = IO.blocking {
    Using.resource(connection.prepareStatement(updateSql)) { statement =>
      statement.setString(1, save.asJson.noSpaces); statement.setTimestamp(2, Timestamp.from(now))
      statement.setObject(3, userId.value); statement.setLong(4, expectedRevision)
      Using.resource(statement.executeQuery())(result => Option.when(result.next())(read(result)))
    }
  }
