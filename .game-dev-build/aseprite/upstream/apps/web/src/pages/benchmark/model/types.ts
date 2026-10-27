import type { BenchmarkView } from '#entities/benchmark/index.js';
import type { CraftView, Facets, GenerationSummary, Score } from '#entities/generation/index.js';

/** One model's strongest showing on this benchmark: its best run on any plugin version. */
export interface ContenderView {
	modelLabel: string;
	plugin: string;
	/** Composite 0–100 of the best run. */
	points: number;
	score: Score;
	craft: CraftView | null;
	run: GenerationSummary;
}

export interface BenchmarkPageData {
	benchmark: BenchmarkView;
	/** Short labels for what the benchmark tests. */
	chips: string[];
	/** Every ranked model's best run, strongest model first. */
	contenders: ContenderView[];
	/** Every run of this prompt, newest first, including runs on older revisions. */
	runs: GenerationSummary[];
	facets: Facets;
	/** Every ranked model in overall leaderboard order; a model's chart colour is its place here, so it matches on every page. */
	modelOrder: string[];
}
