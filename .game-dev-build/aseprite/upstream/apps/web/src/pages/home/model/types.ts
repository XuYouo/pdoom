import type { BenchmarkCardView } from '#entities/benchmark/index.js';
import type { GenerationSummary } from '#entities/generation/index.js';
import type { WallTile } from '#entities/pack/index.js';

export interface HomePageData {
	counts: { generations: number; models: number; prompts: number };
	/** The newest piece, packed or not; null on an empty gallery. */
	newest: GenerationSummary | null;
	/** The start of the gallery wall, newest first: loose pieces and packs. */
	latest: WallTile[];
	/** One entry per benchmark, for the "The benchmark" section. */
	teasers: BenchmarkCardView[];
}
