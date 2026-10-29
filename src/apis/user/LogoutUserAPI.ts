import { APIWithTokenMessage } from '../../system/api/APIMessage';
import type { LogoutUserResponse } from '../../objects/user/apiTypes/LogoutUserResponse';
import { isLogoutUserResponse } from '../../objects/user/apiTypes/validation';
export class LogoutUserAPI extends APIWithTokenMessage<LogoutUserResponse> { constructor() { super('LogoutUser', isLogoutUserResponse); } }
