package pdoom.services.user.tables.users

import cats.effect.IO
import java.sql.Connection
import scala.util.Using

object UserTableInitializer:
  private val createSql = """CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY,
    username varchar(32) NOT NULL,
    username_key varchar(32) NOT NULL UNIQUE,
    password_salt varchar(32) NOT NULL,
    password_hash varchar(64) NOT NULL,
    password_iterations integer NOT NULL CHECK(password_iterations >= 600000),
    created_at timestamptz NOT NULL,
    CHECK(username ~ '^[A-Za-z0-9_]{3,32}$'),
    CHECK(username_key = lower(username))
  )"""
  def initialize(connection: Connection): IO[Unit] = IO.blocking {
    Using.resource(connection.prepareStatement(createSql))(_.executeUpdate()); ()
  }
