package pdoom.services.game.tables.gamescore

import cats.effect.IO
import java.sql.Connection
import scala.util.Using

object GameScoreTableInitializer:
  private val createSql = """CREATE TABLE IF NOT EXISTS game_scores (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    run_id uuid NOT NULL,
    username varchar(32) NOT NULL,
    score integer NOT NULL CHECK(score BETWEEN 0 AND 10000000),
    stage integer NOT NULL CHECK(stage BETWEEN 1 AND 5),
    duration_ms integer NOT NULL CHECK(duration_ms BETWEEN 1000 AND 86400000),
    doom double precision NOT NULL CHECK(doom BETWEEN 0 AND 100),
    ending varchar(10) NOT NULL CHECK(ending IN ('defeat','aligned','warden','foom')),
    personal_best boolean NOT NULL,
    created_at timestamptz NOT NULL,
    UNIQUE(user_id, run_id),
    CHECK(ending = 'defeat' OR (stage = 5 AND (
      (ending = 'aligned' AND doom < 30) OR
      (ending = 'warden' AND doom >= 30 AND doom < 80) OR
      (ending = 'foom' AND doom >= 80))))
  )"""
  private val rankIndexSql = "CREATE INDEX IF NOT EXISTS game_scores_rank_idx ON game_scores(score DESC, created_at ASC, id ASC)"
  private val userIndexSql = "CREATE INDEX IF NOT EXISTS game_scores_user_idx ON game_scores(user_id, score DESC)"
  def initialize(connection: Connection): IO[Unit] = IO.blocking {
    List(createSql, rankIndexSql, userIndexSql).foreach(sql => Using.resource(connection.prepareStatement(sql))(_.executeUpdate())); ()
  }
