import { benchmarkCard } from '#entities/benchmark/index.server.js';
import { gallery, summary } from '#entities/generation/index.server.js';
import { wallTiles } from '#entities/pack/index.js';
import { packSummary } from '#entities/pack/index.server.js';
import type { HomePageData } from '../model/types';

/** Tiles on the home wall: a preview of the gallery's, so the same packs stand in for their pieces. */
const WALL_PREVIEW = 12;

export function load(): HomePageData {
	const { generations, packs, benchmarks, prompts } = gallery();
	const map = (generation: (typeof generations)[number]) => summary(generation, prompts);
	// Both lists are newest first, so the wall's first tiles come from the head of each: only
	// those are mapped, and the page data stays the size of the preview as the gallery grows.
	const tiles = wallTiles(
		generations
			.filter((generation) => generation.pack === null)
			.slice(0, WALL_PREVIEW)
			.map(map),
		packs.slice(0, WALL_PREVIEW).map((pack) => packSummary(pack, map))
	);
	return {
		counts: {
			generations: generations.length,
			models: new Set(generations.flatMap((generation) => generation.models)).size,
			prompts: prompts.length
		},
		newest: generations[0] ? summary(generations[0], prompts) : null,
		latest: tiles.slice(0, WALL_PREVIEW),
		teasers: benchmarks.map((benchmark) => benchmarkCard(benchmark))
	};
}
