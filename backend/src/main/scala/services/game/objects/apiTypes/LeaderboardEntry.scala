package pdoom.services.game.objects.apiTypes

import io.circe.Codec
import io.circe.generic.semiauto.*
import pdoom.services.game.objects.ScoreRecord

final case class LeaderboardEntry(rank: Int, username: String, score: Int, stage: Int, doom: Double, ending: String, createdAt: String)
object LeaderboardEntry:
  given Codec.AsObject[LeaderboardEntry] = deriveCodec
  def fromDomain(value: ScoreRecord, rank: Int): LeaderboardEntry = LeaderboardEntry(rank, value.username,
    value.submission.score, value.submission.stage, value.submission.doom, value.submission.ending.value, value.createdAt.toString)
