interface EnvironmentFrame {
  hero: { count: number; meanY: number } | null;
  core: { count: number } | null;
}
export function groundedEnvironmentActor(value: EnvironmentFrame): boolean {
  const actor = value.hero;
  return !!actor && Number.isInteger(actor.count) && actor.count >= 20
    && Number.isFinite(actor.meanY) && actor.meanY > 285 && actor.meanY < 360;
}
interface EnvironmentPreparationPort<T extends EnvironmentFrame> {
  now(): number;
  ready(timeout: number): Promise<void>;
  ground(timeout: number): Promise<T>;
  insight(): Promise<void>;
  core(timeout: number): Promise<T>;
}
/** Share the original five-second preparation allowance, never restart it per phase.
 * These are host observation deadlines, not a read or replacement of the Core clock.
 * No jump, shot, retry, archived-image substitution or outcome predicate lives here.
 */
export async function prepareEnvironmentJump<T extends EnvironmentFrame>(port: EnvironmentPreparationPort<T>) {
  const start = port.now();
  if (!Number.isFinite(start)) throw Error('Invalid preparation clock');
  const deadline = start + 5000;
  let last = start;
  const requests: { phase: string; remainingMs: number }[] = [];
  const remaining = (phase: string) => {
    const now = port.now();
    if (!Number.isFinite(now) || now < last) throw Error('Invalid preparation clock');
    last = now;
    const ms = deadline - now;
    if (ms <= 0) throw Error('Original five-second preparation deadline expired at ' + phase);
    requests.push({ phase, remainingMs: ms }); return ms;
  };
  await port.ready(remaining('ready'));
  const grounded = await port.ground(remaining('ground'));
  if (!groundedEnvironmentActor(grounded)) throw Error('No visible grounded preparation actor');
  remaining('insight'); await port.insight();
  const exposed = await port.core(remaining('core'));
  const left = remaining('complete');
  if (!groundedEnvironmentActor(exposed) || !Number.isInteger(exposed.core?.count) || (exposed.core?.count ?? 0) <= 30)
    throw Error('No current grounded actor and exposed core');
  return { grounded, exposed, elapsedMs: 5000 - left, requests };
}
