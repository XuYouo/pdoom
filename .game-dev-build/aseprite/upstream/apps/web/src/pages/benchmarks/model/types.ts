import type { BenchmarkCardWithCover, LeaderboardEntryView } from '#entities/benchmark/index.js';

export interface BenchmarksPageData {
	/** How many benchmarks exist, i.e. the denominator of a model's coverage. */
	total: number;
	leaderboard: LeaderboardEntryView[];
	cards: BenchmarkCardWithCover[];
}
