import { palettes, ruleBands } from '#entities/knowledge/index.server.js';
import { agents, skills } from '#entities/plugin/index.server.js';
import type { KnowledgePageData } from '../model/types';

export function load(): KnowledgePageData {
	const all = palettes();
	return {
		bands: ruleBands(),
		skills: skills(),
		agents: agents(),
		palettes: all.filter((preset) => !preset.source),
		paletteCount: all.length
	};
}
