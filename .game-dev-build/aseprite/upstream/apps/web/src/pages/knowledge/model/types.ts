import type { PalettePreset, RuleBand } from '#entities/knowledge/index.js';
import type { Agent, Skill } from '#entities/plugin/index.js';

export interface KnowledgePageData {
	bands: RuleBand[];
	skills: Skill[];
	agents: Agent[];
	/** The hand-written classics; the whole catalogue has its own page. */
	palettes: PalettePreset[];
	paletteCount: number;
}
