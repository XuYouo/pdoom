import { isSoundName, type SoundName } from './catalog';
import { claim, playSound, warmSounds } from './engine';

const INTERACTIVE = [
	'a[href]',
	'button',
	'summary',
	'[role="button"]',
	'[role="link"]',
	'[role="option"]',
	'[role="menuitem"]',
	'[role="tab"]',
	'[role="radio"]',
	'[role="checkbox"]',
	'[role="switch"]'
].join(',');

/**
 * The sound a click on `target` should make, read from the DOM *before* the click's handlers
 * run: afterwards a disclosure's `aria-expanded` already says where it is going, not where it
 * was. `data-sound` on the control or any ancestor overrides the guess; `data-sound="none"`
 * silences it (for controls whose handler plays its own sound later, after an await).
 */
function soundFor(target: EventTarget | null): SoundName | null {
	if (!(target instanceof Element)) return null;
	const control = target.closest(INTERACTIVE);
	if (!control || control.matches(':disabled, [aria-disabled="true"]')) return null;
	const declared = control.closest('[data-sound]')?.getAttribute('data-sound');
	if (declared) return isSoundName(declared) ? declared : null;
	const expanded = control.getAttribute('aria-expanded');
	if (expanded !== null) return expanded === 'true' ? 'collapse' : 'expand';
	const role = control.getAttribute('role');
	if (role === 'option' || role === 'menuitem') return 'select';
	if (
		control.hasAttribute('aria-pressed') ||
		control.hasAttribute('aria-checked') ||
		role === 'switch'
	)
		return 'toggle';
	return 'click';
}

/**
 * Gives every control on the page a sound without each one opting in: one listener on the
 * document, the way the browser itself would. A handler that plays a more specific sound
 * (a lightbox opening, the theme switch) claims the click and the generic one stays quiet.
 *
 * Svelte delegates its own handlers to the app root, which sits under the document, so they
 * run before the bubbling listener here; the state they set flushes in a microtask, and so do
 * the sounds that state triggers — hence the decision waits one more microtask.
 */
export function listenForClicks(): () => void {
	let pending: SoundName | null = null;

	const start = (event: MouseEvent) => {
		claim.taken = false;
		pending = event.isTrusted ? soundFor(event.target) : null;
	};
	const finish = () => {
		const name = pending;
		pending = null;
		if (name)
			queueMicrotask(() => {
				if (!claim.taken) playSound(name);
			});
	};

	window.addEventListener('click', start, { capture: true });
	document.addEventListener('click', finish);
	window.addEventListener('pointerdown', warmSounds, { capture: true, once: true });
	window.addEventListener('keydown', warmSounds, { capture: true, once: true });
	return () => {
		window.removeEventListener('click', start, { capture: true });
		document.removeEventListener('click', finish);
		window.removeEventListener('pointerdown', warmSounds, { capture: true });
		window.removeEventListener('keydown', warmSounds, { capture: true });
	};
}
