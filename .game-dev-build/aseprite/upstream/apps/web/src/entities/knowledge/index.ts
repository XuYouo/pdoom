// Knowledge entity: the rulebook in `rules/`, the bundled palettes, and where each document's
// page is. The markdown renderer and the bundled files are in `index.server.ts`.
export { default as PaletteCard } from './ui/PaletteCard.svelte';
export { KNOWLEDGE_SECTIONS, knowledgePath } from './lib/path.js';
export type { KnowledgeSection } from './lib/path.js';
export type {
	ArticleHeading,
	PalettePreset,
	RenderedMarkdown,
	Rule,
	RuleBand
} from './model/types.js';
