import { decodeGif, type Gif } from '#shared/lib/gif.js';

/**
 * One clock for every animation on the page. Each GIF is stretched or squeezed to the same
 * cycle, so they all start together and end together whatever their own length: comparing a
 * 2-second take with a 5-second one frame for frame is only possible at a shared tempo.
 */
export class Playback {
	/** 0–1 through the shared cycle. */
	position = $state(0);
	playing = $state(false);
	/** Own loop length of every animation currently on screen, by key. */
	durations = $state<Record<string, number>>({});

	/** The longest animation sets the cycle: nothing is played faster than it was made. */
	cycle = $derived(Math.max(0, ...Object.values(this.durations)));

	#origin = 0;
	#frame = 0;

	#users: Record<string, number> = {};

	/**
	 * The same animation can be on screen twice (the page and its full-screen view), so keys are
	 * counted: the first view to leave must not take the other's duration with it.
	 */
	register(key: string, duration: number): () => void {
		this.#users[key] = (this.#users[key] ?? 0) + 1;
		this.durations[key] = duration;
		this.seek(this.position);
		this.#start();
		return () => {
			this.#users[key] = (this.#users[key] ?? 1) - 1;
			if (this.#users[key] === 0) {
				delete this.#users[key];
				delete this.durations[key];
			}
			this.seek(this.position);
			if (Object.keys(this.#users).length === 0) this.#stop();
		};
	}
	speed(duration: number): number {
		return this.cycle > 0 ? duration / this.cycle : 1;
	}

	play() {
		this.playing = true;
		this.#start();
	}

	/** The clock only runs while an animation is on screen: stills and filmstrips need no ticks. */
	#start() {
		if (!this.playing || this.#frame || Object.keys(this.#users).length === 0) return;
		// Resume from where the scrubber left the cycle, not from wherever the clock would be.
		this.#origin = performance.now() - this.position * this.cycle;
		const tick = (now: number) => {
			// rAF timestamps can precede the performance.now() taken in play(): clamp at 0.
			if (this.cycle > 0) this.position = Math.max(0, (now - this.#origin) / this.cycle) % 1;
			this.#frame = requestAnimationFrame(tick);
		};
		this.#frame = requestAnimationFrame(tick);
	}

	pause() {
		this.playing = false;
		this.#stop();
	}

	#stop() {
		cancelAnimationFrame(this.#frame);
		this.#frame = 0;
	}

	seek(position: number) {
		this.position = Math.min(1, Math.max(0, position));
		this.#origin = performance.now() - this.position * this.cycle;
	}

	restart() {
		this.seek(0);
	}
}

const cache = new Map<string, Promise<Gif>>();

/** Fetched and decoded once per URL, however many views show it. */
export function loadGif(url: string): Promise<Gif> {
	let pending = cache.get(url);
	if (!pending) {
		pending = fetch(url)
			.then((response) => {
				if (!response.ok) throw new Error(`${response.status} for ${url}`);
				return response.arrayBuffer();
			})
			.then((buffer) => decodeGif(new Uint8Array(buffer)));
		// A failed load is not cached: the next view retries instead of inheriting the error.
		pending.catch(() => cache.delete(url));
		cache.set(url, pending);
	}
	return pending;
}
