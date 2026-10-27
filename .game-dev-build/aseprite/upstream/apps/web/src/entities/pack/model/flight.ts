/**
 * Which pack is flying from a wall tile to its page. The tile marks it on click; the pack page
 * takes it once, at creation, and only then holds its opening for the flight to land. Without
 * it, every page transition into a pack — from a piece's "Pack:" link, say — would wait for a
 * pack that is not coming. Written in the browser only, so the server never sees a mark.
 */
let flying: string | null = null;

export function markFlight(id: string) {
	flying = id;
}

/** True when `id` is the pack the last tile click sent; clears the mark either way. */
export function takeFlight(id: string): boolean {
	const match = flying === id;
	flying = null;
	return match;
}
