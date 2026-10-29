import { APIMessage } from '../../system/api/APIMessage';
import type { ListLeaderboardResponse } from '../../objects/game/apiTypes/ListLeaderboardResponse';
import { isListLeaderboardResponse } from '../../objects/game/apiTypes/validation';
export class ListLeaderboardAPI extends APIMessage<ListLeaderboardResponse> {
  constructor(readonly limit = 10, readonly offset = 0) { super('ListLeaderboard', isListLeaderboardResponse); }
}
