package pdoom

import cats.effect.IO
import pdoom.system.DatabaseSession
import pdoom.services.user.tables.users.UserTableInitializer
import pdoom.services.user.tables.usersession.UserSessionTableInitializer
import pdoom.services.game.tables.gamesave.GameSaveTableInitializer
import pdoom.services.game.tables.gamescore.GameScoreTableInitializer

object DatabaseBootstrap:
  // Explicit opt-in only. SQL belongs to each table initializer, not this composition root.
  def initialize(database: DatabaseSession): IO[Unit] = database.withTransactionConnection { connection =>
    UserTableInitializer.initialize(connection) *>
      UserSessionTableInitializer.initialize(connection) *>
      GameSaveTableInitializer.initialize(connection) *>
      GameScoreTableInitializer.initialize(connection)
  }
