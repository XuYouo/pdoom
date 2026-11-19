import type { KeyboardEvent } from 'react';

/** Keep keyboard traversal inside the current native modal, including nested settings. */
export function keepDialogFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== 'Tab' || event.defaultPrevented) return;
  const dialog = event.currentTarget;
  if (!(event.target instanceof HTMLElement) || event.target.closest('dialog') !== dialog) return;
  const visible = Array.from(dialog.querySelectorAll<HTMLElement>(
    'button, a[href], area[href], input, select, textarea, summary, [tabindex], [contenteditable="true"]',
  )).filter(node => node.closest('dialog') === dialog && node.tabIndex >= 0 && !node.matches(':disabled') &&
    !node.closest('[hidden], [inert]') && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden');
  // A radio group is one browser Tab stop; its arrow-key selection remains native.
  const controls = visible.filter(node => {
    if (!node.matches('input[type="radio"]') || !node.getAttribute('name')) return true;
    const radio = node as HTMLInputElement;
    const group = visible.filter(candidate => candidate.matches('input[type="radio"]') &&
      candidate.getAttribute('name') === radio.name && (candidate as HTMLInputElement).form === radio.form) as HTMLInputElement[];
    return (group.find(candidate => candidate.checked) ?? group[0]) === radio;
  }).sort((a, b) => (a.tabIndex > 0 ? a.tabIndex : Infinity) - (b.tabIndex > 0 ? b.tabIndex : Infinity));
  if (!controls.length) { event.preventDefault(); dialog.focus(); return; }
  const current = controls.indexOf(dialog.ownerDocument.activeElement as HTMLElement);
  const target = current < 0 ? (event.shiftKey ? controls.at(-1)! : controls[0])
    : event.shiftKey && current === 0 ? controls.at(-1)!
      : !event.shiftKey && current === controls.length - 1 ? controls[0] : null;
  if (target) { event.preventDefault(); target.focus(); }
}
