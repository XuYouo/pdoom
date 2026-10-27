import { closeSync, openSync, readFileSync, readSync } from 'node:fs';
import { join } from 'node:path';
import { fileUrl } from './files.server';
import {
	compareVersions,
	loadGallery,
	type Gallery,
	type Generation,
	type Prompt,
	type StoredFile
} from '@pebbly/gallery';
import { imageSize } from '#shared/lib/image-size.server.js';
import { REPO_URL } from '#shared/lib/site.js';
import type { Facets, FileView, GenerationDetail, GenerationSummary } from '../model/types';

let cached: Gallery | null = null;

/** The whole gallery, validated. A build with an invalid gallery fails here, loudly. */
export function gallery(): Gallery {
	if (!cached) cached = loadGallery(__GALLERY_ROOT__);
	return cached;
}

const IMAGE_EXTENSIONS = new Set(['png', 'gif', 'webp']);

/** Canvas sizes of a generation's .aseprite sources: u16 LE width at byte 8, height at byte 10. */
function sourceSizes(generation: Generation): { width: number; height: number }[] {
	return generation.files.flatMap((file) => {
		if (file.extension !== 'aseprite' && file.extension !== 'ase') return [];
		const head = Buffer.alloc(12);
		const fd = openSync(file.absolutePath, 'r');
		try {
			if (readSync(fd, head, 0, 12, 0) < 12) return [];
		} finally {
			closeSync(fd);
		}
		const width = head.readUInt16LE(8);
		const height = head.readUInt16LE(10);
		return width > 0 && height > 0 ? [{ width, height }] : [];
	});
}

/**
 * The upscale factor baked into an exported image: the smallest whole k for which the image is
 * some source canvas at k×. 1 when nothing divides cleanly, i.e. the file is already native.
 */
function bakedScale(
	size: { width: number; height: number },
	sources: { width: number; height: number }[]
): number {
	const candidates = sources.flatMap((source) =>
		[size.width / source.width, size.height / source.height].filter(
			(k) => Number.isInteger(k) && k >= 1 && size.width % k === 0 && size.height % k === 0
		)
	);
	return candidates.length > 0 ? Math.min(...candidates) : 1;
}

function fileView(
	id: string,
	file: StoredFile,
	sources: { width: number; height: number }[]
): FileView {
	const size = IMAGE_EXTENSIONS.has(file.extension) ? imageSize(file.absolutePath) : null;
	return {
		name: file.path,
		role: file.role,
		...(file.label === undefined ? {} : { label: file.label }),
		...(file.step === undefined ? {} : { step: file.step }),
		bytes: file.bytes,
		extension: file.extension,
		url: fileUrl(id, file.path),
		width: size?.width ?? null,
		height: size?.height ?? null,
		pixel: size ? bakedScale(size, sources) : 1
	};
}

export function summary(generation: Generation, prompts: Prompt[]): GenerationSummary {
	const prompt = generation.benchmark
		? prompts.find((p) => p.id === generation.benchmark!.prompt)
		: undefined;
	const search = [
		generation.title,
		generation.description ?? '',
		generation.author.name,
		generation.author.github ?? '',
		generation.harness,
		...generation.models,
		...generation.references.imageModels,
		...generation.tags,
		...generation.steps.map((step) => step.text),
		prompt?.title ?? ''
	]
		.join('\n')
		.toLowerCase();
	return {
		id: generation.id,
		title: generation.title,
		date: generation.date,
		author: generation.author,
		plugin: generation.plugin,
		harness: generation.harness,
		models: generation.models,
		modelLabel: generation.modelLabel,
		references: generation.references,
		tags: generation.tags,
		cover: fileView(generation.id, generation.cover, sourceSizes(generation)),
		benchmark: generation.benchmark
			? {
					prompt: generation.benchmark.prompt,
					promptTitle: prompt?.title ?? generation.benchmark.prompt,
					revision: generation.benchmark.revision
				}
			: null,
		score: generation.score,
		points: generation.points,
		outdated: generation.outdated,
		search
	};
}

export function detail(generation: Generation, prompts: Prompt[]): GenerationDetail {
	const prompt = generation.benchmark
		? prompts.find((p) => p.id === generation.benchmark!.prompt)
		: undefined;
	const promptSteps = prompt && !generation.outdated ? prompt.steps : [];
	return {
		...summary(generation, prompts),
		...(generation.description === undefined ? {} : { description: generation.description }),
		steps: generation.steps.map((step, index) => ({
			...(promptSteps[index] ? { title: promptSteps[index].title } : {}),
			text: step.text,
			...(step.original === undefined ? {} : { original: step.original }),
			...(step.model === undefined ? {} : { model: step.model }),
			interventions: step.interventions
		})),
		files: generation.files.map((file) => fileView(generation.id, file, sourceSizes(generation))),
		validate: generation.validate,
		results: (generation.benchmark?.results ?? []).map((result) => {
			const criterion = prompt?.criteria.find((c) => c.id === result.criterion);
			return {
				...result,
				...(criterion ? { text: criterion.text, step: criterion.step } : {})
			};
		}),
		ratings: generation.ratings,
		craft: generation.craft,
		metrics: generation.metrics,
		yaml: readFileSync(
			join(gallery().root, 'generations', generation.id, 'generation.yaml'),
			'utf8'
		),
		githubUrl: `${REPO_URL}/tree/main/gallery/generations/${generation.id}`,
		pack: packOf(generation)
	};
}

function packOf(generation: Generation): { id: string; title: string } | null {
	if (generation.pack === null) return null;
	const pack = gallery().packs.find((candidate) => candidate.id === generation.pack);
	return pack ? { id: pack.id, title: pack.title } : null;
}

const sortedSet = (values: Iterable<string>) =>
	[...new Set(values)].sort((a, b) => a.localeCompare(b));

/** Facet options derived from the generations actually passed in (so a prompt-filtered grid only offers relevant choices). */
export function facets(generations: Generation[], prompts: Prompt[]): Facets {
	return {
		models: sortedSet(generations.flatMap((generation) => generation.models)),
		plugins: [...new Set(generations.map((generation) => generation.plugin))].sort((a, b) =>
			compareVersions(b, a)
		),
		harnesses: sortedSet(generations.map((generation) => generation.harness)),
		prompts: prompts
			.filter((prompt) =>
				generations.some((generation) => generation.benchmark?.prompt === prompt.id)
			)
			.map((prompt) => ({ id: prompt.id, title: prompt.title })),
		tags: sortedSet(generations.flatMap((generation) => generation.tags))
	};
}
