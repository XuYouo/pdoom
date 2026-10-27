import { error } from '@sveltejs/kit';
import { gallery, summary } from '#entities/generation/index.server.js';
import { packSummary } from '#entities/pack/index.server.js';
import type { PackPageData } from '../model/types';

export const entries = () => gallery().packs.map((pack) => ({ id: pack.id }));

export function load({ params }: { params: { id: string } }): PackPageData {
	const { packs, prompts } = gallery();
	const pack = packs.find((candidate) => candidate.id === params.id);
	if (!pack) error(404, `No pack called "${params.id}"`);
	// Linked only when every piece ran one benchmark; a free-form piece anywhere means no link.
	const ran = new Set(pack.generations.map((generation) => generation.benchmark?.prompt ?? null));
	const [only = null] = ran;
	return {
		pack: packSummary(pack, (generation) => summary(generation, prompts)),
		benchmark: ran.size === 1 ? only : null
	};
}
