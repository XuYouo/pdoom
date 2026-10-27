import { error } from '@sveltejs/kit';
import { detail, gallery } from '#entities/generation/index.server.js';
import type { GenerationPageData } from '../model/types';

export const entries = () => gallery().generations.map((generation) => ({ id: generation.id }));

export function load({ params }: { params: { id: string } }): GenerationPageData {
	const { generations, prompts } = gallery();
	const generation = generations.find((candidate) => candidate.id === params.id);
	if (!generation) error(404, `No piece called "${params.id}"`);
	return { generation: detail(generation, prompts) };
}
