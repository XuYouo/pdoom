import { benchmarkCard, leaderboardView } from '#entities/benchmark/index.server.js';
import { gallery, summary } from '#entities/generation/index.server.js';
import type { BenchmarksPageData } from '../model/types';

export function load(): BenchmarksPageData {
	const { benchmarks, generations, prompts, leaderboard } = gallery();
	return {
		total: benchmarks.length,
		leaderboard: leaderboardView(leaderboard),
		cards: benchmarks.map((benchmark) => {
			const card = benchmarkCard(benchmark);
			const coverRun = generations.find((generation) => generation.id === card.coverRun);
			return { ...card, cover: coverRun ? summary(coverRun, prompts).cover : null };
		})
	};
}
