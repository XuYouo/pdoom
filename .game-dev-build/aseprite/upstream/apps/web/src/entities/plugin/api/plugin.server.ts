import { parse } from 'yaml';
import { REPO_URL } from '#shared/lib/site.js';
import type { Agent, Skill } from '../model/types';
import readme from '../../../../../../README.md?raw';
import installGuide from '../../../../../../docs/INSTALL.md?raw';

// Bundled from the checkout the site is built from, not fetched from GitHub: skills, agents
// and docs are part of the same commit, so the site can never describe a plugin the deployed
// one is not. Vite imports rather than node:fs because /plugin is rendered by an ISR function,
// where the repository is not on disk.
const skillFiles = import.meta.glob<string>('../../../../../../skills/*/SKILL.md', {
	query: '?raw',
	import: 'default',
	eager: true
});
const agentFiles = import.meta.glob<string>('../../../../../../agents/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
});

/** README.md and docs/INSTALL.md as markdown source, for /llms-full.txt. */
export const docs = { readme, installGuide };

/** `studio` is the front door; the rest follow in the order a drawing goes through them. */
const SKILL_ORDER = [
	'studio',
	'brief',
	'concept',
	'new',
	'palette',
	'draw',
	'shade',
	'rig',
	'animate',
	'tileset',
	'review',
	'fix',
	'export',
	'submit'
];

function frontmatter(source: string, file: string): Record<string, unknown> {
	const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) throw new Error(`${file}: no frontmatter`);
	return parse(match[1]!) as Record<string, unknown>;
}

function text(data: Record<string, unknown>, key: string, file: string): string {
	const value = data[key];
	if (typeof value !== 'string' || !value.trim())
		throw new Error(`${file}: missing "${key}" in frontmatter`);
	return value.trim();
}

export function skills(): Skill[] {
	const rank = (name: string) => {
		const index = SKILL_ORDER.indexOf(name);
		return index === -1 ? SKILL_ORDER.length : index;
	};
	return Object.entries(skillFiles)
		.map(([file, source]) => {
			const path = `skills/${file.split('/').at(-2)!}/SKILL.md`;
			const data = frontmatter(source, file);
			const name = text(data, 'name', file);
			return {
				name,
				title: typeof data.title === 'string' ? data.title : name,
				description: text(data, 'description', file),
				path,
				url: `${REPO_URL}/blob/main/${path}`
			};
		})
		.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

export function agents(): Agent[] {
	return Object.entries(agentFiles)
		.map(([file, source]) => {
			const path = `agents/${file.split('/').at(-1)!}`;
			const data = frontmatter(source, file);
			return {
				name: text(data, 'name', file),
				description: text(data, 'description', file),
				path,
				url: `${REPO_URL}/blob/main/${path}`
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A skill's or agent's markdown with the frontmatter cut off, by repository path (the `path`
 * of a `Skill` or `Agent`): the body the agent reads, for the knowledge base.
 */
export function pluginMarkdown(path: string): string | undefined {
	const source = (path.startsWith('skills/') ? skillFiles : agentFiles)[
		`../../../../../../${path}`
	];
	return source?.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
}
