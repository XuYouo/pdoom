package pdoom.services.game.objects

import java.time.Instant

final case class ScoreRecord(id: ScoreId, submission: ScoreSubmission, username: String, personalBest: Boolean, createdAt: Instant)
