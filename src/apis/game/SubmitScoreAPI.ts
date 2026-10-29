import { APIWithTokenMessage } from '../../system/api/APIMessage';
import type { Ending } from '../../objects/game/GameSaveData';
import type { SubmitScoreResponse } from '../../objects/game/apiTypes/SubmitScoreResponse';
import { isSubmitScoreResponse } from '../../objects/game/apiTypes/validation';
export class SubmitScoreAPI extends APIWithTokenMessage<SubmitScoreResponse> {
  constructor(readonly runId: string, readonly score: number, readonly stage: number, readonly durationMs: number, readonly doom: number, readonly ending: Ending) { super('SubmitScore', isSubmitScoreResponse); }
}
