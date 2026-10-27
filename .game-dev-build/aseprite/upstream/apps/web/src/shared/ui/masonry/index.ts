export { default as Masonry } from './Masonry.svelte';

/** Columns for a wall of art cards by the wall's own width: a wide screen gets more columns, not wider cards. */
export const WALL_COLUMNS: [number, number][] = [
	[1900, 6],
	[1500, 5],
	[1150, 4],
	[800, 3],
	[500, 2]
];
