// Server-only barrel: the rulebook and palette presets bundled at build time, and the renderer
// that turns the repository's markdown into knowledge-base pages.
export { palettes, ruleBands, rules, ruleSource } from './api/knowledge.server.js';
export { plainText, renderMarkdown } from './lib/markdown.js';
export type { MarkdownContext } from './lib/markdown.js';
