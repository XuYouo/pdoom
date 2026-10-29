import { APIMessage } from '../../system/api/APIMessage';
import type { AuthResponse } from '../../objects/user/apiTypes/AuthResponse';
import { isAuthResponse } from '../../objects/user/apiTypes/validation';
export class RegisterUserAPI extends APIMessage<AuthResponse> {
  constructor(readonly username: string, readonly password: string) { super('RegisterUser', isAuthResponse); }
}
