import { APIWithTokenMessage } from '../../system/api/APIMessage';
import type { GameSaveData } from '../../objects/game/GameSaveData';
import type { SaveGameResponse } from '../../objects/game/apiTypes/SaveGameResponse';
import { isSaveGameResponse } from '../../objects/game/apiTypes/validation';
export class SaveGameAPI extends APIWithTokenMessage<SaveGameResponse> {
  constructor(readonly save: GameSaveData, readonly expectedRevision: number) { super('SaveGame', isSaveGameResponse); }
}
