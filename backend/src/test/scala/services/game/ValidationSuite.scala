package pdoom.services.game

import munit.FunSuite
import io.circe.syntax.*
import java.util.UUID
import pdoom.services.game.objects.*
import pdoom.services.game.objects.apiTypes.*
import pdoom.services.game.utils.ValidateGame

class ValidationSuite extends FunSuite:
  private val sample = GameSave(1, RunId(UUID.fromString("00000000-0000-4000-8000-000000000001")), 123, 1, 0,
    100, 10, 0, 0, 0, List("constitutional"), Nil, false, ActionCounts(0, 0, 0, 0))

  test("domain <-> transport save conversion preserves every field and wire shape") {
    val dto = GameSaveData.fromDomain(sample)
    assertEquals(dto.toDomain, Right(sample))
    assertEquals(dto.asJson.as[GameSaveData], Right(dto))
    assertEquals(dto.asJson.hcursor.get[String]("runId"), Right(sample.runId.value.toString))
    assertEquals(dto.asJson.asObject.get.keys.toSet, Set("schemaVersion", "runId", "seed", "stage", "checkpoint", "hp", "doom",
      "tokens", "score", "elapsedMs", "inventory", "upgrades", "donated", "actionCounts"))
  }

  test("reject incompatible schema, unknown/duplicate inventory and unsafe counters") {
    assert(ValidateGame.save(sample).isRight)
    List(sample.copy(schemaVersion = 2), sample.copy(seed = 0), sample.copy(stage = 6), sample.copy(hp = Double.NaN),
      sample.copy(doom = 101), sample.copy(tokens = -1), sample.copy(score = 10000001), sample.copy(elapsedMs = 86400001),
      sample.copy(inventory = List("unknown")), sample.copy(inventory = List("lisp", "lisp")),
      sample.copy(upgrades = List("secret-admin")), sample.copy(actionCounts = ActionCounts(-1, 0, 0, 0))).foreach { save =>
      assert(ValidateGame.save(save).isLeft)
    }
  }

  test("all three ending thresholds and defeat are exhaustive") {
    def score(ending: Ending, doom: Double, stage: Int = 5) = ScoreSubmission(sample.runId, 42, stage, 1000, doom, ending)
    assert(ValidateGame.score(score(Ending.Aligned, 29.99)).isRight)
    assert(ValidateGame.score(score(Ending.Aligned, 30)).isLeft)
    assert(ValidateGame.score(score(Ending.Warden, 30)).isRight)
    assert(ValidateGame.score(score(Ending.Warden, 29)).isLeft)
    assert(ValidateGame.score(score(Ending.Warden, 79.99)).isRight)
    assert(ValidateGame.score(score(Ending.Warden, 80)).isLeft)
    assert(ValidateGame.score(score(Ending.Foom, 80)).isRight)
    assert(ValidateGame.score(score(Ending.Foom, 79)).isLeft)
    assert(ValidateGame.score(score(Ending.Foom, 90, 4)).isLeft)
    assert(ValidateGame.score(score(Ending.Defeat, 0, 1)).isRight)
    assert(ValidateGame.score(score(Ending.Defeat, 0).copy(durationMs = 999)).isLeft)
  }

  test("UUID parser and pagination reject malformed or unbounded values") {
    assert(RunId.parse("1-1-1-1-1").isLeft)
    assert(RunId.parse("not-an-id").isLeft)
    assert(ValidateGame.pagination(1, 0).isRight)
    assert(ValidateGame.pagination(50, 10000).isRight)
    List((0, 0), (51, 0), (10, -1), (10, 10001)).foreach { case (limit, offset) =>
      assert(ValidateGame.pagination(limit, offset).isLeft)
    }
  }
