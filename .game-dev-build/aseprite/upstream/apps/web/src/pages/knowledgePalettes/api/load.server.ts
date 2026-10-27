import { palettes } from '#entities/knowledge/index.server.js';
import type { KnowledgePalettesPageData, PaletteRow } from '../model/types';

/** How many palettes the page renders before the full catalogue has loaded. */
export const FIRST_PAGE = 48;

/**
 * The whole catalogue, for /knowledge/palettes/catalogue.json. Two thousand palettes are about
 * half a megabyte of JSON: inlined into the page they would be sent twice (markup and hydration
 * data) on every visit, so the page carries the first screen and fetches the rest.
 */
export function paletteCatalogue(): PaletteRow[] {
	return palettes().map((preset) => ({
		id: preset.id,
		name: preset.name,
		author: preset.author,
		hex: preset.colors.map((color) => color.slice(1)).join(''),
		notes: preset.notes,
		...(preset.source ? { source: preset.source } : {}),
		tags: (preset.tags ?? []).join(' ')
	}));
}

export function load(): KnowledgePalettesPageData {
	const all = paletteCatalogue();
	return {
		first: all.slice(0, FIRST_PAGE),
		total: all.length,
		fromLospec: all.filter((row) => row.source).length
	};
}
