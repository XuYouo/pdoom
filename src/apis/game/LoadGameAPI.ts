import { APIWithTokenMessage } from '../../system/api/APIMessage';
import type { LoadGameResponse } from '../../objects/game/apiTypes/LoadGameResponse';
import { isLoadGameResponse } from '../../objects/game/apiTypes/validation';
export class LoadGameAPI extends APIWithTokenMessage<LoadGameResponse> { constructor() { super('LoadGame', isLoadGameResponse); } }
