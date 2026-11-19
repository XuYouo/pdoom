import { useEffect, useRef, useState } from 'react';
import type { GameBridge } from '../game/bridge';
import { COMBAT_FEEDBACK_DURATION_MS, combatFeedbackMessage, type CombatFeedbackMessage } from '../functions/combatFeedback';

interface Receipt { message: CombatFeedbackMessage; receivedAt: number; sequence: number }

/** Stays mounted through pause, freezing with simulation time; menus and new attempts clear receipts. */
export function CombatFeedback({ bridge, elapsedMs, suppressed = false, controlled = false }: { bridge: GameBridge; elapsedMs: number; suppressed?: boolean; controlled?: boolean }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const observedTime = useRef(elapsedMs);
  const sequence = useRef(0);
  useEffect(() => bridge.onEvent(event => {
    if (event.type === 'hud') observedTime.current = event.snapshot.elapsedMs;
    if (event.type !== 'notice') return;
    const message = combatFeedbackMessage(event.message);
    if (message) setReceipt({ message, receivedAt: observedTime.current, sequence: ++sequence.current });
  }), [bridge]);
  // The existing 200ms HUD snapshot ages receipts. No wall-clock timer or frame loop is added.
  if (suppressed || !receipt || elapsedMs < receipt.receivedAt || elapsedMs - receipt.receivedAt >= COMBAT_FEEDBACK_DURATION_MS
    || controlled && receipt.message.kind === 'release') return null;
  const { message } = receipt;
  return <p key={receipt.sequence} className="runtime-log mission-notice combat-feedback" role="status" aria-live="polite" aria-atomic="true" data-feedback={message.kind} data-tone={message.tone}>
    <span className="feedback-key" aria-hidden="true">{message.key}</span>
    <span><strong>{message.title}</strong>{message.detail && <small>{message.detail}</small>}</span>
  </p>;
}
