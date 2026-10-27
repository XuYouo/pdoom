/**
 * Every sound the site plays, by what it means rather than what it is. The files live in
 * static/sounds/ under these names; static/sounds/CREDITS.txt says which soundcn effect each
 * one is (all Kenney, CC0).
 *
 * `volume` is relative to the master level in ./engine: the small UI ticks sit low so a page
 * of clicking never grows tiring, and the pack opening is the one moment allowed to be loud.
 */
export const SOUNDS = {
	click: { volume: 0.35 },
	select: { volume: 0.5 },
	toggle: { volume: 0.5 },
	expand: { volume: 0.45 },
	collapse: { volume: 0.45 },
	open: { volume: 0.5 },
	close: { volume: 0.5 },
	confirm: { volume: 0.55 },
	error: { volume: 0.5 },
	'switch-on': { volume: 0.5 },
	'switch-off': { volume: 0.5 },
	card: { volume: 0.7 },
	'pack-take': { volume: 0.8 },
	'pack-shake': { volume: 0.7 },
	'pack-tear': { volume: 0.9 },
	'card-rise': { volume: 0.7 },
	'card-deal-1': { volume: 0.75 },
	'card-deal-2': { volume: 0.75 },
	'card-deal-3': { volume: 0.75 },
	'card-deal-4': { volume: 0.75 },
	'card-fan': { volume: 0.8 }
} as const satisfies Record<string, { volume: number }>;

export type SoundName = keyof typeof SOUNDS;

export const SOUND_NAMES = Object.keys(SOUNDS) as SoundName[];

export function isSoundName(value: string): value is SoundName {
	return Object.hasOwn(SOUNDS, value);
}
