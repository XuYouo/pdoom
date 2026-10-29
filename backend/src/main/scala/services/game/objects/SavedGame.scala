package pdoom.services.game.objects

import java.time.Instant

final case class SavedGame(save: GameSave, revision: Long, updatedAt: Instant)
