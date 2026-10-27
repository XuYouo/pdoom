import type {
	CraftView,
	FileView,
	Score,
	ScoreComponentsView
} from '#entities/generation/@x/benchmark.js';
import type { PromptView } from '#entities/prompt/@x/benchmark.js';

export interface RunView {
	id: string;
	title: string;
	date: string;
	score: Score;
	points: number;
}

export interface CellView {
	modelLabel: string;
	plugin: string;
	best: Score;
	/** Points (0–100) and parts of the best run. */
	points: number;
	components: ScoreComponentsView;
	/** Craft of the best run; null when no judge has rated it. */
	craft: CraftView | null;
	runs: RunView[];
	/** Per-criterion outcome of the best run, in the prompt's criterion order. */
	bestResults: { criterion: string; pass: boolean; note?: string }[];
}

/** A run on an older revision of the prompt: listed, never ranked. */
export interface OutdatedRunView {
	id: string;
	title: string;
	modelLabel: string;
	plugin: string;
	revision: number;
}

export interface BenchmarkView {
	prompt: PromptView;
	versions: string[];
	models: string[];
	cells: CellView[];
	outdatedRuns: OutdatedRunView[];
	/** Every ranked run of each model, oldest first; models in `models` order. */
	progress: ModelProgressView[];
}

export interface ModelProgressView {
	modelLabel: string;
	/** Across plugin versions, in the order they were run: by date, then by id within a day. */
	runs: { id: string; date: string; plugin: string; points: number }[];
}

export interface LeaderboardSnapshotView {
	date: string;
	/** Mean points, 0–100, from the runs dated on or before `date`. */
	score: number;
	benchmarks: number;
	/** True when the model added a run that day; otherwise the score carries over. */
	ran: boolean;
}

export interface LeaderboardEntryView {
	modelLabel: string;
	/** Mean points, 0–100, over every benchmark of the suite. */
	score: number;
	/** Mean compliance, craft and speed, 0–1, over the same set. */
	compliance: number;
	craft: number;
	speed: number;
	benchmarks: number;
	runs: number;
	/** The score at the end of each day runs were added, oldest first; the last is `score`. */
	history: LeaderboardSnapshotView[];
}

export interface BenchmarkCardView {
	id: string;
	title: string;
	summary: string;
	revision: number;
	criteria: number;
	chips: string[];
	steps: number;
	runs: number;
	/** Id of the highest-scoring run (compliance, craft, then date break ties), whose cover represents the benchmark. */
	coverRun: string | null;
	/** The three strongest models, each with its best run. */
	top: { modelLabel: string; plugin: string; points: number; run: string }[];
}

/** A benchmark card together with the cover image of its best run. */
export interface BenchmarkCardWithCover extends BenchmarkCardView {
	cover: FileView | null;
}
