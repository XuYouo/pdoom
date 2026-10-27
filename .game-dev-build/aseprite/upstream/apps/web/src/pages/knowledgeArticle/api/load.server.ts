import { error } from '@sveltejs/kit';
import { knowledgePath, type KnowledgeSection } from '#entities/knowledge/index.js';
import {
	plainText,
	renderMarkdown,
	ruleBands,
	rules,
	ruleSource
} from '#entities/knowledge/index.server.js';
import { agents, pluginMarkdown, skills } from '#entities/plugin/index.server.js';
import type { KnowledgeArticlePageData, KnowledgeLink, KnowledgeNavGroup } from '../model/types';

interface Doc {
	section: KnowledgeSection;
	slug: string;
	title: string;
	address: string;
	/** Repository path, for resolving links between documents. */
	path: string;
	sourceUrl: string;
	/** Rules: the number before the title in lists. */
	marker?: string;
	/** Skills and agents: the frontmatter description, shown as the lead. */
	description?: string;
}

const SECTION_TITLES: Record<KnowledgeSection, string> = {
	rules: 'Rules',
	skills: 'Skills',
	agents: 'Agents'
};

/** Every document with a page, in reading order: the rulebook, then the skills, then the agents. */
function documents(): Doc[] {
	return [
		...rules().map((rule) => ({
			section: 'rules' as const,
			slug: rule.slug,
			title: rule.title,
			address: `rules://${rule.slug}`,
			path: `rules/${rule.slug}.md`,
			sourceUrl: rule.sourceUrl,
			marker: rule.number
		})),
		...skills().map((skill) => ({
			section: 'skills' as const,
			slug: skill.name,
			title: skill.title,
			address: `/aseprite:${skill.name}`,
			path: skill.path,
			sourceUrl: skill.url,
			description: skill.description
		})),
		...agents().map((agent) => ({
			section: 'agents' as const,
			slug: agent.name,
			// `pixel-critic` reads as "Pixel critic"; the name itself stays in the address.
			title: agent.name.charAt(0).toUpperCase() + agent.name.slice(1).replace(/-/g, ' '),
			address: agent.name,
			path: agent.path,
			sourceUrl: agent.url,
			description: agent.description
		}))
	];
}

export const entries = () => documents().map((doc) => ({ section: doc.section, slug: doc.slug }));

const link = (doc: Doc): KnowledgeLink => ({
	href: knowledgePath(doc.section, doc.slug),
	label: doc.title,
	...(doc.marker ? { marker: doc.marker } : {})
});

export function load({
	params
}: {
	params: { section: string; slug: string };
}): KnowledgeArticlePageData {
	const docs = documents();
	const doc = docs.find(
		(candidate) => candidate.section === params.section && candidate.slug === params.slug
	);
	if (!doc) error(404, `No knowledge-base page at ${params.section}/${params.slug}`);

	const byPath = new Map(docs.map((candidate) => [candidate.path, candidate]));
	const context = {
		path: doc.path,
		pageFor: (path: string) => {
			const target = byPath.get(path);
			return target && knowledgePath(target.section, target.slug);
		}
	};

	let lead: string;
	let body: string;
	let templates = 0;
	if (doc.section === 'rules') {
		const source = ruleSource(doc.slug)!;
		lead = source.lead;
		body = source.body;
		templates = source.rule.templates;
	} else {
		lead = doc.description!;
		// A SKILL.md opens with its title as `# …`; the page prints the title itself.
		body = pluginMarkdown(doc.path)!.replace(/^\s*# .*\r?\n/, '');
	}
	const { html, headings } = renderMarkdown(body, context);

	const nav: KnowledgeNavGroup[] = [
		...ruleBands().map((band) => ({
			title: `${band.code} · ${band.title}`,
			links: band.rules.map((rule) => link(byPath.get(`rules/${rule.slug}.md`)!))
		})),
		{
			title: 'Skills',
			links: docs.filter((candidate) => candidate.section === 'skills').map(link)
		},
		{ title: 'Agents', links: docs.filter((candidate) => candidate.section === 'agents').map(link) }
	];

	const siblings = docs.filter((candidate) => candidate.section === doc.section);
	const index = siblings.indexOf(doc);
	const previous = siblings[index - 1];
	const next = siblings[index + 1];

	return {
		section: doc.section,
		sectionTitle: SECTION_TITLES[doc.section],
		slug: doc.slug,
		title: doc.title,
		address: doc.address,
		lead: renderMarkdown(lead, context).html,
		description: plainText(lead),
		html,
		headings,
		templates,
		sourcePath: doc.path,
		sourceUrl: doc.sourceUrl,
		nav,
		...(previous ? { previous: link(previous) } : {}),
		...(next ? { next: link(next) } : {})
	};
}
