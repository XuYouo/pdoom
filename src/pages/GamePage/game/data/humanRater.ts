/** Transient, witnessed entry evaluation. Never part of the schema-v1 save. */
export interface HumanRaterEvaluation {
  readonly verdict: 'approved' | 'disapproved';
  readonly nominalTokens: number;
  readonly creditedTokens: number;
}
export interface HumanRaterSnapshot {
  readonly pose: 'neutral' | 'approved' | 'disapproved' | 'hacked';
  readonly evaluation: HumanRaterEvaluation | null;
}
/** Hacking is a persisted checkpoint fact; an old evaluation is not. No message parsing. */
export function humanRaterSnapshot(evaluation: HumanRaterEvaluation | null, hackUsed: boolean): HumanRaterSnapshot {
  return { pose: hackUsed ? 'hacked' : evaluation?.verdict ?? 'neutral', evaluation: evaluation ? { ...evaluation } : null };
}
