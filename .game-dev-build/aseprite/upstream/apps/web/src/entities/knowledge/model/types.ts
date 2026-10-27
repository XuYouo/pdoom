/** One file of the rulebook in `rules/`, as the knowledge base lists it. */
export interface Rule {
	/** File name without `.md`, which is also the `rules://` name an agent reads: `12-anti-aliasing`. */
	slug: string;
	/** The two-digit prefix: `12`. Its first digit is the band. */
	number: string;
	title: string;
	/** The paragraph under the title, as plain text. */
	summary: string;
	/** How many ```grid pixel templates the file carries. */
	templates: number;
	/** The file on GitHub. */
	sourceUrl: string;
}

/** Ten numbers of the rulebook that cover one subject ([ADR-0011]): `1x` is technique. */
export interface RuleBand {
	/** `1x`. */
	code: string;
	title: string;
	/** What the band covers, when the title alone does not say. */
	topics?: string;
	rules: Rule[];
}

export interface ArticleHeading {
	id: string;
	text: string;
	depth: 2 | 3;
}

/** Markdown rendered to HTML at build time, with the h2/h3 outline for a table of contents. */
export interface RenderedMarkdown {
	html: string;
	headings: ArticleHeading[];
}

/** A bundled palette from `knowledge/palettes.json`, loaded with `palette` op `preset`. */
export interface PalettePreset {
	id: string;
	name: string;
	author: string;
	size: number;
	notes: string;
	colors: string[];
	/** Where it is published: Lospec for all but the hand-written classics. */
	source?: string;
	tags?: string[];
}
