import type { Facets, GenerationSummary } from '#entities/generation/index.js';
import type { PackSummary } from '#entities/pack/index.js';

export interface GalleryPageData {
	/** The pieces not inside a pack, newest first. */
	generations: GenerationSummary[];
	/** Newest member first; each is one tile on the wall. */
	packs: PackSummary[];
	facets: Facets;
}
