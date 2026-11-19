import type { KeyboardEvent, MouseEvent } from 'react';

/** Keep native control activation/navigation out of Phaser, while gameplay letters remain usable. */
export function keepHudControlKeysLocal(event: KeyboardEvent<HTMLElement>) {
  // Shift precedes Tab in reverse navigation; leaking its keydown queues a real dash.
  if (['Enter', ' ', 'Shift', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)
    && event.target instanceof HTMLElement && event.target.closest('button,summary,details,[tabindex]')) event.stopPropagation();
}

/** A pointer skill click returns to play; keyboard/assistive activation keeps normal Tab navigation. */
export function focusGameAfterPointer(event: MouseEvent<HTMLButtonElement>, root: HTMLElement | null) {
  if (event.detail > 0) root?.querySelector<HTMLCanvasElement>('.game-canvas canvas')?.focus({ preventScroll: true });
}
