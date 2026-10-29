package pdoom.services.game.objects

import io.circe.Codec
import io.circe.generic.semiauto.*

final case class GameSave(
    schemaVersion: Int, runId: RunId, seed: Int, stage: Int, checkpoint: Int,
    hp: Double, doom: Double, tokens: Int, score: Int, elapsedMs: Int,
    inventory: List[String], upgrades: List[String], donated: Boolean, actionCounts: ActionCounts
)
object GameSave:
  given Codec.AsObject[GameSave] = deriveCodec
