package pdoom.system

import cats.effect.IO

final case class DatabaseConfig(url: String, user: String, password: String)
object DatabaseConfig:
  def fromEnvironment: IO[DatabaseConfig] = IO.delay {
    def required(name: String): String = sys.env.get(name).filter(_.nonEmpty)
      .getOrElse(throw new IllegalArgumentException(s"Missing $name; no database is selected by default."))
    val url = required("PDOOM_DB_URL")
    require(url.startsWith("jdbc:postgresql:"), "Only PostgreSQL JDBC URLs are supported.")
    DatabaseConfig(url, required("PDOOM_DB_USER"), sys.env.getOrElse("PDOOM_DB_PASSWORD", ""))
  }
