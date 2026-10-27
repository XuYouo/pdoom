// Web Audio playback, after soundcn's sound-engine (https://soundcn.xyz, MIT): one shared
// AudioContext and a cache of decoded buffers. The sounds are files in static/sounds/ rather
// than soundcn's base64 modules, so they cost the JS bundle nothing and load on first use.
import { untrack } from 'svelte';
import { SOUNDS, SOUND_NAMES, type SoundName } from './catalog';
import { soundSetting } from './settings.svelte';

const MASTER_VOLUME = 0.6;
/**
 * A sound that cannot start within this long of being asked for is dropped. It covers a slow
 * first fetch, and a suspended context: outside a user gesture the browser holds `resume()`
 * until the next click, and every sound queued meanwhile would then burst out at once.
 */
const STALE_MS = 300;

let context: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<SoundName, Promise<AudioBuffer | null>>();

/**
 * Set by every `playSound`. The click listener (./clicks) clears it as a click starts and
 * plays its generic sound only if nothing in the click's handlers played a more specific one.
 */
export const claim = { taken: false };

function audio(): { context: AudioContext; master: GainNode } | null {
	if (typeof AudioContext === 'undefined') return null;
	if (!context || !master) {
		context = new AudioContext();
		master = context.createGain();
		master.gain.value = MASTER_VOLUME;
		master.connect(context.destination);
	}
	return { context, master };
}

function load(ctx: AudioContext, name: SoundName): Promise<AudioBuffer | null> {
	let buffer = buffers.get(name);
	if (!buffer) {
		buffer = fetch(`/sounds/${name}.mp3`)
			.then((response) => {
				if (!response.ok) throw new Error(`${response.status} for ${name}`);
				return response.arrayBuffer();
			})
			.then((bytes) => ctx.decodeAudioData(bytes))
			.catch(() => {
				// Forget the failure so a later play retries instead of staying silent for good.
				buffers.delete(name);
				return null;
			});
		buffers.set(name, buffer);
	}
	return buffer;
}

/** Fetch and decode every sound ahead of need; called on the visitor's first gesture. */
export function warmSounds(): void {
	if (!soundSetting.enabled) return;
	const output = audio();
	if (!output) return;
	for (const name of SOUND_NAMES) void load(output.context, name);
}

export interface PlayOptions {
	/** Playback rate: above 1 is higher and shorter, for variations on one sound. */
	rate?: number;
}

export function playSound(name: SoundName, { rate = 1 }: PlayOptions = {}): void {
	claim.taken = true;
	// Untracked: sounds are played from effects and attachments (a dialog opening), and those
	// must not re-run — closing and reopening the dialog — when the visitor flips the switch.
	if (!untrack(() => soundSetting.enabled)) return;
	// Before the visitor's first gesture on this page (a pack page loaded directly opens itself)
	// the browser may refuse audio, or — under a lenient autoplay policy — allow it; stay silent
	// either way, so arriving never startles and the result does not depend on the browser.
	if (navigator.userActivation?.hasBeenActive === false) return;
	const output = audio();
	if (!output) return;
	const { context: ctx, master: out } = output;
	const asked = performance.now();
	const ready = ctx.state === 'running' ? null : ctx.resume().catch(() => {});
	void Promise.all([load(ctx, name), ready]).then(([buffer]) => {
		if (!buffer || ctx.state !== 'running' || performance.now() - asked > STALE_MS) return;
		const source = ctx.createBufferSource();
		const gain = ctx.createGain();
		source.buffer = buffer;
		source.playbackRate.value = rate;
		gain.gain.value = SOUNDS[name].volume;
		source.connect(gain).connect(out);
		source.start();
	});
}
