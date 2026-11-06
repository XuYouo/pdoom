import { inspect } from 'node:util';
export function formatMirrorFailure(reason: unknown, format: (value: unknown) => string = value => inspect(value, { depth: 4, maxArrayLength: 16, maxStringLength: 4096, getters: false, customInspect: false })): string {
  try {
    const text = format(reason);
    return text.length <= 4096 ? text : text.slice(0, 4096) + '...[truncated]';
  } catch { return '<diagnostic unavailable>'; }
}
/** Observe the original right window while the original DOM dash assertion is pending.
 * Both must settle before returning/throwing: no orphaned pause/resume work can reach left input.
 * No extra window, timer, input, retry, captured-text substitution or replacement frame.
 */
export async function observeMirrorRightWithDash<T>(observeRight: () => Promise<T>, confirmLearnedDash: () => Promise<unknown>): Promise<T> {
  const [observed, confirmed] = await Promise.allSettled([
    Promise.resolve().then(observeRight),
    Promise.resolve().then(confirmLearnedDash),
  ]);
  if (observed.status === 'rejected') {
    if (confirmed.status === 'rejected') {
      const message = `Mirror observation and dash confirmation failed.\nObservation: ${formatMirrorFailure(observed.reason)}\nConfirmation: ${formatMirrorFailure(confirmed.reason)}`;
      throw Object.assign(new Error(message), { cause: observed.reason, confirmationError: confirmed.reason });
    }
    throw observed.reason;
  }
  if (confirmed.status === 'rejected') throw confirmed.reason;
  return observed.value;
}
