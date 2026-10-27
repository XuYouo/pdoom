import type { Agent, Skill } from '#entities/plugin/index.js';
import type { RepoStats } from '#shared/api/index.js';

export interface PluginPageData {
	/** The README as GitHub renders it; null when GitHub could not be reached at build time. */
	readme: string | null;
	stats: RepoStats | null;
	skills: Skill[];
	agents: Agent[];
	/** When the numbers were fetched: the site is a build-time snapshot. */
	fetchedAt: string;
}
