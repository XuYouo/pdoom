/**
 * Steps joined by a blank line. Nothing is prepended: a benchmark run pastes them as sent, and
 * a per-step fresh session is the caller's job, not the gallery's.
 */
export function sequenceText(steps: { text: string }[]): string {
	return steps.map((step) => step.text).join('\n\n');
}
