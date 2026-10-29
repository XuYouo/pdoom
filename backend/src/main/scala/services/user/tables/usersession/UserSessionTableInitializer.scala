package pdoom.services.user.tables.usersession

import cats.effect.IO
import java.sql.Connection
import scala.util.Using

object UserSessionTableInitializer:
  private val createSql = """CREATE TABLE IF NOT EXISTS user_sessions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash char(64) NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
    created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    CHECK(expires_at > created_at)
  )"""
  private val indexSql = "CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions(user_id)"
  def initialize(connection: Connection): IO[Unit] = IO.blocking {
    List(createSql, indexSql).foreach(sql => Using.resource(connection.prepareStatement(sql))(_.executeUpdate())); ()
  }
