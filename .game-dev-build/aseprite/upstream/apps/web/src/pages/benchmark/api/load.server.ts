import { error } from '@sveltejs/kit';
import { benchmarkView, criterionChips } from '#entities/benchmark/index.server.js';
import { facets, gallery, summary } from '#entities/generation/index.server.js';
import { promptView } from '#entities/prompt/index.server.js';
import type { BenchmarkPageData, ContenderView } from '../model/types';

export const entries = () => gallery().prompts.map((prompt) => ({ prompt: prompt.id }));

export function load({ params }: { params: { prompt: string } }): BenchmarkPageData {
	const { benchmarks, generations, prompts, leaderboard } = gallery();
	const benchmark = benchmarks.find((candidate) => candidate.prompt.id === params.prompt);
	if (!benchmark) error(404, `No benchmark prompt called "${params.prompt}"`);
	const runs = generations.filter(
		(generation) => generation.benchmark?.prompt === benchmark.prompt.id
	);
	// Every run, best first by the same points the hero ranks by, so a card's place matches its
	// score; runs without points (an older revision) go last, newest first among themselves.
	const summaries = runs
		.map((run) => summary(run, prompts))
		.sort(
			(a, b) =>
				(b.points ?? -1) - (a.points ?? -1) || b.date.localeCompare(a.date) || b.id.localeCompare(a.id)
		);
	const view = benchmarkView(benchmark, promptView(benchmark.prompt));
	const byId = new Map(summaries.map((run) => [run.id, run]));
	// `models` is already strongest first; each model is shown by its best cell across plugin
	// versions, the same pick the benchmark index card makes.
	const contenders = view.models.flatMap((modelLabel): ContenderView[] => {
		const cell = view.cells
			.filter((candidate) => candidate.modelLabel === modelLabel)
			.sort((a, b) => b.points - a.points)[0];
		const run = cell && byId.get(cell.runs[0]!.id);
		return cell && run
			? [
					{
						modelLabel,
						plugin: cell.plugin,
						points: cell.points,
						score: cell.best,
						craft: cell.craft,
						run
					}
				]
			: [];
	});
	return {
		benchmark: view,
		chips: criterionChips(benchmark.prompt),
		contenders,
		runs: summaries,
		facets: facets(runs, prompts),
		modelOrder: leaderboard.map((entry) => entry.modelLabel)
	};
}
