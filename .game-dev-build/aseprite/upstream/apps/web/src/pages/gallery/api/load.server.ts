import { facets, gallery, summary } from '#entities/generation/index.server.js';
import { packSummary } from '#entities/pack/index.server.js';
import type { GalleryPageData } from '../model/types';

export function load(): GalleryPageData {
	const { generations, packs, prompts } = gallery();
	return {
		generations: generations
			.filter((generation) => generation.pack === null)
			.map((generation) => summary(generation, prompts)),
		packs: packs.map((pack) => packSummary(pack, (generation) => summary(generation, prompts))),
		// Every piece, packed or not: a filter has to offer a model that only appears inside a pack.
		facets: facets(generations, prompts)
	};
}
