import type {
	Craft,
	FileRole,
	GenerationFile,
	Rating,
	ScoreComponents,
	StepMetrics
} from '@pebbly/gallery';

/** Judges' craft scores averaged: `score` 0–1, `axes` means 0–4. */
export type CraftView = Craft;
/** One judge's blind 0–4 scores; see gallery/RUBRIC.md. */
export type RatingView = Rating;
export type StepMetricsView = StepMetrics;

export interface Score {
	passed: number;
	total: number;
}

/** The parts a run's points are made of: compliance, craft and speed, each 0–1. */
export type ScoreComponentsView = ScoreComponents;

export interface FileView {
	name: string;
	role: FileRole;
	label?: string;
	step?: number;
	bytes: number;
	extension: string;
	url: string;
	/** Intrinsic pixel size of an image file; null for non-images or an unreadable header. */
	width: number | null;
	height: number | null;
	/**
	 * Screen pixels per art pixel already baked into the file (an 8× export is 8). Pages
	 * divide it out and re-scale by whole numbers, so every art pixel stays square.
	 */
	pixel: number;
}

export interface StepView {
	title?: string;
	text: string;
	/** The prompt as sent, when `text` is its English rendering. */
	original?: string;
	model?: string;
	interventions: string[];
}

export interface CriterionView {
	id: string;
	step: number;
	text: string;
}

export interface CriterionResultView {
	criterion: string;
	pass: boolean;
	note?: string;
	/** Missing when the run used an older revision whose criterion no longer exists. */
	text?: string;
	step?: number;
}

export interface GenerationSummary {
	id: string;
	title: string;
	date: string;
	author: { name: string; github?: string };
	plugin: string;
	harness: string;
	models: string[];
	modelLabel: string;
	/** Whether an image model (or the author's own art) supplied the design; see ADR-0009. */
	references: GenerationFile['references'];
	tags: string[];
	cover: FileView;
	benchmark: { prompt: string; promptTitle: string; revision: number } | null;
	score: Score | null;
	/** Composite 0–100; null for outdated runs and runs outside a benchmark. */
	points: number | null;
	outdated: boolean;
	/** Lower-cased text the gallery's search box matches against. */
	search: string;
}

export interface GenerationDetail extends GenerationSummary {
	description?: string;
	steps: StepView[];
	files: FileView[];
	validate: { step: number; passed: boolean; score?: number; errors: number; warnings: number }[];
	results: CriterionResultView[];
	ratings: RatingView[];
	craft: CraftView | null;
	metrics: StepMetricsView[];
	/** The run's own generation.yaml, verbatim. */
	yaml: string;
	githubUrl: string;
	/** The pack the run is filed under on the gallery wall; null when it hangs loose. */
	pack: { id: string; title: string } | null;
}

/** What each facet filter offers. */
export interface Facets {
	models: string[];
	plugins: string[];
	harnesses: string[];
	prompts: { id: string; title: string }[];
	tags: string[];
}
