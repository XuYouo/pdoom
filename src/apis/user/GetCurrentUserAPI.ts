import { APIWithTokenMessage } from '../../system/api/APIMessage';
import type { GetCurrentUserResponse } from '../../objects/user/apiTypes/GetCurrentUserResponse';
import { isGetCurrentUserResponse } from '../../objects/user/apiTypes/validation';
export class GetCurrentUserAPI extends APIWithTokenMessage<GetCurrentUserResponse> { constructor() { super('GetCurrentUser', isGetCurrentUserResponse); } }
