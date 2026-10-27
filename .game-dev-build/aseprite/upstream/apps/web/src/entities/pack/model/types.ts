import type { GenerationSummary } from '#entities/generation/@x/pack.js';

/** A curated stack of generations: one tile on the gallery wall, opened on its own page. */
export interface PackSummary {
	id: string;
	title: string;
	description?: string;
	/** The newest member's date: where the tile sorts among loose pieces on a newest-first wall. */
	date: string;
	/** Members in the order pack.yaml lists them, which is the order they fan out in. */
	generations: GenerationSummary[];
}
