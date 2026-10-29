package pdoom.services.game.tables.gamesave

import cats.effect.IO
import java.sql.Connection
import scala.util.Using

object GameSaveTableInitializer:
  private val createSql = """CREATE TABLE IF NOT EXISTS game_saves (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    save_data jsonb NOT NULL,
    revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    CHECK(jsonb_typeof(save_data) = 'object'),
    CHECK(save_data->>'schemaVersion' = '1'),
    CHECK(octet_length(save_data::text) <= 65536)
  )"""
  def initialize(connection: Connection): IO[Unit] = IO.blocking {
    Using.resource(connection.prepareStatement(createSql))(_.executeUpdate()); ()
  }
