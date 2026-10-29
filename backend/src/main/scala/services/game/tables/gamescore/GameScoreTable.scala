package pdoom.services.game.tables.gamescore

import cats.effect.IO
import java.sql.{Connection, ResultSet, Timestamp}
import java.time.Instant
import java.util.UUID
import scala.util.Using
import pdoom.services.user.objects.UserId
import pdoom.services.game.objects.*

private[game] object GameScoreTable:
  private final case class Row(id: UUID, runId: UUID, username: String, score: Int, stage: Int,
      durationMs: Int, doom: Double, ending: String, personalBest: Boolean, createdAt: Instant):
    def toDomain: ScoreRecord = ScoreRecord(ScoreId(id), ScoreSubmission(RunId(runId), score, stage, durationMs,
      doom, Ending.parse(ending).fold(message => throw new IllegalStateException(message), identity)), username, personalBest, createdAt)
  private def read(result: ResultSet): ScoreRecord = Row(result.getObject("id", classOf[UUID]),
    result.getObject("run_id", classOf[UUID]), result.getString("username"), result.getInt("score"), result.getInt("stage"),
    result.getInt("duration_ms"), result.getDouble("doom"), result.getString("ending"), result.getBoolean("personal_best"),
    result.getTimestamp("created_at").toInstant).toDomain

  // Serialize a user's scores, including their first insert, without writing/locking another service's table.
  private val lockSql = "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))"
  def lockUserScores(connection: Connection, userId: UserId): IO[Unit] = IO.blocking {
    Using.resource(connection.prepareStatement(lockSql)) { statement =>
      statement.setString(1, s"game_scores:${userId.value}")
      Using.resource(statement.executeQuery())(_.next()); ()
    }
  }

  private val findSql = "SELECT * FROM game_scores WHERE user_id = ? AND run_id = ?"
  def find(connection: Connection, userId: UserId, runId: RunId): IO[Option[ScoreRecord]] = IO.blocking {
    Using.resource(connection.prepareStatement(findSql)) { statement =>
      statement.setObject(1, userId.value); statement.setObject(2, runId.value)
      Using.resource(statement.executeQuery())(result => Option.when(result.next())(read(result)))
    }
  }

  private val bestSql = "SELECT score FROM game_scores WHERE user_id = ? ORDER BY score DESC LIMIT 1"
  def best(connection: Connection, userId: UserId): IO[Option[Int]] = IO.blocking {
    Using.resource(connection.prepareStatement(bestSql)) { statement =>
      statement.setObject(1, userId.value)
      Using.resource(statement.executeQuery())(result => Option.when(result.next())(result.getInt("score")))
    }
  }

  private val insertSql = """INSERT INTO game_scores(id, user_id, run_id, username, score, stage, duration_ms, doom, ending, personal_best, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"""
  def insert(connection: Connection, userId: UserId, value: ScoreRecord): IO[Unit] = IO.blocking {
    Using.resource(connection.prepareStatement(insertSql)) { statement =>
      statement.setObject(1, value.id.value); statement.setObject(2, userId.value); statement.setObject(3, value.submission.runId.value)
      statement.setString(4, value.username); statement.setInt(5, value.submission.score); statement.setInt(6, value.submission.stage)
      statement.setInt(7, value.submission.durationMs); statement.setDouble(8, value.submission.doom)
      statement.setString(9, value.submission.ending.value); statement.setBoolean(10, value.personalBest)
      statement.setTimestamp(11, Timestamp.from(value.createdAt)); statement.executeUpdate(); ()
    }
  }

  private val listSql = "SELECT * FROM game_scores ORDER BY score DESC, created_at ASC, id ASC LIMIT ? OFFSET ?"
  def list(connection: Connection, limit: Int, offset: Int): IO[List[ScoreRecord]] = IO.blocking {
    Using.resource(connection.prepareStatement(listSql)) { statement =>
      statement.setInt(1, limit); statement.setInt(2, offset)
      Using.resource(statement.executeQuery())(result => Iterator.continually(result.next()).takeWhile(identity).map(_ => read(result)).toList)
    }
  }
