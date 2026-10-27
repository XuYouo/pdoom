import type { FileView, Score } from '#entities/generation/index.js';

/** One image a run can be compared on: a step's still, its animation, or its filmstrip. */
export interface CompareView {
	/** Stable across runs of one benchmark, e.g. `2-animation`. */
	key: string;
	label: string;
}

export interface CompareRun {
	id: string;
	modelLabel: string;
	plugin: string;
	harness: string;
	date: string;
	score: Score | null;
	points: number | null;
	outdated: boolean;
	/** Image per view key; a run lacking a view (older revision, missing export) has no entry. */
	images: Record<string, FileView>;
}

export interface BenchmarkComparePageData {
	prompt: { id: string; title: string };
	/** Every view any run offers, in step order. */
	views: CompareView[];
	/** Runs of this prompt, newest first. */
	runs: CompareRun[];
}
