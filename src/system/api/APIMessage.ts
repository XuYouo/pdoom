import routes from '../../../contracts/api.json';

export type ApiAction = keyof typeof routes;
export type ResponseValidator<Response> = (value: unknown) => value is Response;

/** Generic transport boundary: business DTO validators are injected by each thin API declaration. */
export abstract class APIMessage<Response> {
  declare readonly response: Response;
  constructor(readonly action: ApiAction, readonly validateResponse: ResponseValidator<Response>, readonly authenticated = false) {}
}
export abstract class APIWithTokenMessage<Response> extends APIMessage<Response> {
  constructor(action: ApiAction, validateResponse: ResponseValidator<Response>) { super(action, validateResponse, true); }
}
export function apiName(action: ApiAction) { return routes[action]; }
