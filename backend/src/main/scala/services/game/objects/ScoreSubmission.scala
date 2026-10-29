package pdoom.services.game.objects

final case class ScoreSubmission(runId: RunId, score: Int, stage: Int, durationMs: Int, doom: Double, ending: Ending)
