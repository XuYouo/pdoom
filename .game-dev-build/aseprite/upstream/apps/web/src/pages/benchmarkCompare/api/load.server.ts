import { error } from '@sveltejs/kit';
import { detail, gallery } from '#entities/generation/index.server.js';
import type { FileView } from '#entities/generation/index.js';
import type { BenchmarkComparePageData, CompareRun, CompareView } from '../model/types';

export const entries = () => gallery().prompts.map((prompt) => ({ prompt: prompt.id }));

type Kind = 'still' | 'animation' | 'filmstrip';
const KIND_ORDER: Kind[] = ['still', 'animation', 'filmstrip'];

/**
 * Which comparable image a file is, if any. Sources, references, sheets and loose frames
 * of an animation are not comparable side by side; only what a run shows as its result is.
 */
function kindOf(file: FileView): Kind | null {
	if (file.width === null) return null;
	if (file.role === 'filmstrip') return 'filmstrip';
	if (file.role === 'animation' || (file.role === 'cover' && file.extension === 'gif'))
		return 'animation';
	if (file.role === 'cover' || file.role === 'frame') return 'still';
	return null;
}

export function load({ params }: { params: { prompt: string } }): BenchmarkComparePageData {
	const { generations, prompts } = gallery();
	const prompt = prompts.find((candidate) => candidate.id === params.prompt);
	if (!prompt) error(404, `No benchmark prompt called "${params.prompt}"`);

	const views = new Map<string, { step: number; kind: Kind }>();
	const runs: CompareRun[] = generations
		.filter((generation) => generation.benchmark?.prompt === prompt.id)
		.map((generation) => {
			const run = detail(generation, prompts);
			const images: Record<string, FileView> = {};
			for (const file of run.files) {
				const kind = kindOf(file);
				if (!kind) continue;
				const step = file.step ?? 0;
				const key = `${step}-${kind}`;
				// The first file of a kind per step wins: the yaml lists the one the author meant first.
				if (images[key]) continue;
				images[key] = file;
				views.set(key, { step, kind });
			}
			return {
				id: run.id,
				modelLabel: run.modelLabel,
				plugin: run.plugin,
				harness: run.harness,
				date: run.date,
				score: run.score,
				points: run.points,
				outdated: run.outdated,
				images
			};
		});

	const ordered: CompareView[] = [...views.entries()]
		.sort(
			([, a], [, b]) => a.step - b.step || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
		)
		.map(([key, { step, kind }]) => {
			const title = prompt.steps[step - 1]?.title;
			const stepLabel = step === 0 ? '' : title ? `Step ${step} (${title}): ` : `Step ${step}: `;
			return {
				key,
				label: stepLabel + (step === 0 ? kind[0]!.toUpperCase() + kind.slice(1) : kind)
			};
		});

	return { prompt: { id: prompt.id, title: prompt.title }, views: ordered, runs };
}
