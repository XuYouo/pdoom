import type { Prompt } from '@pebbly/gallery';
import type { PromptView } from '../model/types';

export function promptView(prompt: Prompt): PromptView {
	return {
		id: prompt.id,
		title: prompt.title,
		summary: prompt.summary,
		revision: prompt.revision,
		tags: prompt.tags,
		setup: prompt.setup,
		steps: prompt.steps.map((step) => ({ title: step.title, text: step.text, interventions: [] })),
		criteria: prompt.criteria
	};
}
