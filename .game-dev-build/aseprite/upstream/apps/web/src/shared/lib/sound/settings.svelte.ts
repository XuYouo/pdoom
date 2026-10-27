const KEY = 'pebbly-sound';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * Whether the site makes sound. On unless the visitor turned it off with the header switch,
 * or — before they have touched the switch — their system asks for reduced motion: someone
 * who wants the interface calm gets a quiet one, and can still turn sound on.
 *
 * Starts as "on, nothing stored" on the server and in the first client render, so hydration
 * matches; `restore()` (called once the app mounts) then reads the browser.
 */
class SoundSetting {
	#choice = $state<'on' | 'off' | null>(null);
	#reducedMotion = $state(false);

	get enabled(): boolean {
		return this.#choice === null ? !this.#reducedMotion : this.#choice === 'on';
	}

	set enabled(value: boolean) {
		this.#choice = value ? 'on' : 'off';
		try {
			localStorage.setItem(KEY, this.#choice);
		} catch {
			// Storage blocked (private mode, a sandboxed frame): the choice lasts this visit only.
		}
	}

	restore(): () => void {
		try {
			const stored = localStorage.getItem(KEY);
			if (stored === 'on' || stored === 'off') this.#choice = stored;
		} catch {
			// Storage blocked: fall back to the system preference.
		}
		const query = matchMedia(REDUCED_MOTION);
		const update = () => (this.#reducedMotion = query.matches);
		update();
		query.addEventListener('change', update);
		return () => query.removeEventListener('change', update);
	}
}

export const soundSetting = new SoundSetting();
