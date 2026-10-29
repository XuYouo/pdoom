package pdoom.services.game.objects.apiTypes

import io.circe.Codec
import io.circe.generic.semiauto.*
import pdoom.services.game.objects.{GameSave, RunId}

final case class GameSaveData(
    schemaVersion: Int, runId: String, seed: Int, stage: Int, checkpoint: Int,
    hp: Double, doom: Double, tokens: Int, score: Int, elapsedMs: Int,
    inventory: List[String], upgrades: List[String], donated: Boolean, actionCounts: ActionCountsData
):
  def toDomain: Either[String, GameSave] = RunId.parse(runId).map { id =>
    GameSave(schemaVersion, id, seed, stage, checkpoint, hp, doom, tokens, score, elapsedMs,
      inventory, upgrades, donated, actionCounts.toDomain)
  }
object GameSaveData:
  given Codec.AsObject[GameSaveData] = deriveCodec
  def fromDomain(value: GameSave): GameSaveData = GameSaveData(value.schemaVersion, value.runId.value.toString,
    value.seed, value.stage, value.checkpoint, value.hp, value.doom, value.tokens, value.score, value.elapsedMs,
    value.inventory, value.upgrades, value.donated, ActionCountsData.fromDomain(value.actionCounts))
