import type { Generation, Pack } from '@pebbly/gallery';
import type { GenerationSummary } from '#entities/generation/@x/pack.js';
import type { PackSummary } from '../model/types';

/**
 * One pack. `summarize` is the generation entity's own mapper, passed in so this slice does
 * not reach into it; the members arrive already sorted best-first by score
 * (`loadGallery`), so the first one is the cover; pack.yaml order does not matter.
 */
export function packSummary(
	pack: Pack,
	summarize: (generation: Generation) => GenerationSummary
): PackSummary {
	return {
		id: pack.id,
		title: pack.title,
		...(pack.description === undefined ? {} : { description: pack.description }),
		date: pack.date,
		generations: pack.generations.map(summarize)
	};
}
