import type { CriterionView, StepView } from '#entities/generation/@x/prompt.js';

export interface PromptView {
	id: string;
	title: string;
	summary: string;
	revision: number;
	tags: string[];
	setup: {
		canvas: { width: number; height: number; colorMode: string };
		palette?: string;
		rules: string[];
	};
	steps: StepView[];
	criteria: CriterionView[];
}
