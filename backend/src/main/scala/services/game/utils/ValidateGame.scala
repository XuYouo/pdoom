package pdoom.services.game.utils

import pdoom.services.game.objects.*

private[game] object ValidateGame:
  private val relics = Set("constitutional", "recursive", "interpretability", "residual", "lisp", "context-expansion", "temperature")
  private val upgrades = Set("reinforced", "overclocked", "expanded", "calibrated")
  private def bounded(value: Double, minimum: Double, maximum: Double): Boolean =
    value.isFinite && value >= minimum && value <= maximum
  private def known(values: List[String], allowed: Set[String]): Boolean =
    values.size <= 12 && values.distinct.size == values.size && values.forall(allowed.contains)

  def save(value: GameSave): Either[String, GameSave] =
    val counts = value.actionCounts
    for
      _ <- Either.cond(value.schemaVersion == 1, (), "Unsupported save schemaVersion.")
      _ <- Either.cond(value.seed > 0 && bounded(value.stage, 1, 5) && bounded(value.checkpoint, 0, 100), (), "Invalid save progression.")
      _ <- Either.cond(bounded(value.hp, 0, 100) && bounded(value.doom, 0, 100), (), "Invalid hp or doom.")
      _ <- Either.cond(bounded(value.tokens, 0, 1000000) && bounded(value.score, 0, 10000000) && bounded(value.elapsedMs, 0, 86400000), (), "Invalid save counters.")
      _ <- Either.cond(known(value.inventory, relics) && known(value.upgrades, upgrades), (), "Unknown or duplicate inventory/upgrade ID.")
      _ <- Either.cond(List(counts.shots, counts.dashes, counts.rewinds, counts.insights).forall(bounded(_, 0, 1000000)), (), "Invalid actionCounts.")
    yield value

  def score(value: ScoreSubmission): Either[String, ScoreSubmission] =
    val endingMatches = value.ending match
      case Ending.Defeat => true
      case Ending.Aligned => value.stage == 5 && value.doom < 30
      case Ending.Warden => value.stage == 5 && value.doom >= 30 && value.doom < 80
      case Ending.Foom => value.stage == 5 && value.doom >= 80
    for
      _ <- Either.cond(bounded(value.score, 0, 10000000) && bounded(value.stage, 1, 5) && bounded(value.doom, 0, 100), (), "Invalid score, stage or doom.")
      _ <- Either.cond(bounded(value.durationMs, 1000, 86400000), (), "durationMs must be between 1000 and 86400000.")
      _ <- Either.cond(endingMatches, (), "Ending does not match stage and doom.")
    yield value

  def pagination(limit: Int, offset: Int): Either[String, Unit] =
    Either.cond(limit >= 1 && limit <= 50 && offset >= 0 && offset <= 10000, (), "limit must be 1–50 and offset 0–10000.")
