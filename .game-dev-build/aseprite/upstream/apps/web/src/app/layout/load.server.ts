import { json } from '@sveltejs/kit';
import { repoStats } from '#shared/api/index.server.js';

/**
 * Data every page shares; the star count shows in the header. Null when GitHub was
 * unreachable. Prerendered pages carry the count from their build; the header then refreshes
 * it from /api/stars, which is cached on the same two-hour window as /plugin.
 */
export async function load(): Promise<{ stars: number | null }> {
	return { stars: (await repoStats())?.stars ?? null };
}

/**
 * GET /api/stars → `{ stars: number }`. A failed GitHub call answers 503 with no-store, so the
 * ISR cache never keeps "no count" for two hours; the header then keeps the count it has.
 */
export async function starsResponse(): Promise<Response> {
	const { stars } = await load();
	if (stars === null) {
		return json({ stars }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
	}
	return json({ stars });
}
