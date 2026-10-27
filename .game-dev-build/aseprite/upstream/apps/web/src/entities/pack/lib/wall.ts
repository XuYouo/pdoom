import type { GenerationSummary } from '#entities/generation/@x/pack.js';
import type { PackSummary } from '../model/types';

/** One tile on a wall of art: a loose piece, or a pack standing in for all of its pieces. */
export type WallTile =
	| { kind: 'generation'; id: string; date: string; generation: GenerationSummary }
	| { kind: 'pack'; id: string; date: string; pack: PackSummary };

/**
 * Loose pieces and packs as one newest-first wall. Packs go in first and the sort is stable, so
 * on a shared date a pack leads that day's loose pieces.
 */
export function wallTiles(generations: GenerationSummary[], packs: PackSummary[]): WallTile[] {
	return [
		...packs.map((pack) => ({ kind: 'pack' as const, id: pack.id, date: pack.date, pack })),
		...generations.map((generation) => ({
			kind: 'generation' as const,
			id: generation.id,
			date: generation.date,
			generation
		}))
	].sort((a, b) => b.date.localeCompare(a.date));
}

/** A stable key across both kinds: a pack and a piece may share a slug. */
export const wallTileKey = (tile: WallTile) => `${tile.kind}:${tile.id}`;
