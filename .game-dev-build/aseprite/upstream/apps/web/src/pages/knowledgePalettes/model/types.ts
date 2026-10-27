/** A palette as the catalogue page ships it: 2000 of them, so the colours travel as one string. */
export interface PaletteRow {
	id: string;
	name: string;
	author: string;
	/** Every colour's six hex digits, concatenated: `1a1c2c5d275d…`. */
	hex: string;
	notes: string;
	source?: string;
	/** Space-separated, for search. */
	tags: string;
}

export interface KnowledgePalettesPageData {
	/** The first screen; the rest comes from /knowledge/palettes/catalogue.json. */
	first: PaletteRow[];
	total: number;
	fromLospec: number;
}
