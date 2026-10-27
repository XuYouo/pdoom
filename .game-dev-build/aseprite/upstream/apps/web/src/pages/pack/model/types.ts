import type { PackSummary } from '#entities/pack/index.js';

export interface PackPageData {
	pack: PackSummary;
	/** The benchmark prompt id when every piece in the pack ran it, so the page can link its ranking. */
	benchmark: string | null;
}
