import { error } from '@sveltejs/kit';
import { gallery } from '#entities/generation/index.server.js';
import { knowledgePath } from '#entities/knowledge/index.js';
import { rules } from '#entities/knowledge/index.server.js';
import { agents, skills } from '#entities/plugin/index.server.js';
import { SITE_URL } from '#shared/lib/site.js';

interface Entry {
	path: string;
	lastmod?: string;
}

const XML = '<?xml version="1.0" encoding="UTF-8"?>';
const NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';

/**
 * /sitemap.xml is a sitemap index over one sitemap per kind of page, so the gallery can grow
 * past the 50 000-URL limit of a single file and Search Console reports coverage per section.
 * Kept as explicit lists rather than crawled: a page that should not be indexed (the raw file
 * routes, the 404) simply is not here. A new top-level page is added to `pages` by hand.
 */
function sections(): Record<string, Entry[]> {
	const { generations, packs, prompts } = gallery();
	const newest = generations
		.map((generation) => generation.date)
		.sort()
		.at(-1);
	return {
		pages: [
			{ path: '/', lastmod: newest },
			{ path: '/plugin' },
			{ path: '/plugin/install' },
			{ path: '/gallery', lastmod: newest },
			{ path: '/benchmarks' },
			{ path: '/contribute' },
			{ path: '/knowledge' },
			{ path: '/knowledge/palettes' }
		],
		benchmarks: prompts.flatMap((prompt) => [
			{ path: `/benchmarks/${prompt.id}` },
			{ path: `/benchmarks/${prompt.id}/compare` }
		]),
		knowledge: [
			...rules().map((rule) => ({ path: knowledgePath('rules', rule.slug) })),
			...skills().map((skill) => ({ path: knowledgePath('skills', skill.name) })),
			...agents().map((agent) => ({ path: knowledgePath('agents', agent.name) }))
		],
		gallery: [
			...packs.map((pack) => ({ path: `/packs/${pack.id}`, lastmod: pack.date })),
			...generations.map((generation) => ({
				path: `/g/${generation.id}`,
				lastmod: generation.date
			}))
		]
	};
}

// Paths are route slugs, so `&` is the only character XML needs escaped in them.
const loc = (path: string) => `<loc>${`${SITE_URL}${path}`.replace(/&/g, '&amp;')}</loc>`;
const lastmod = (date: string | undefined) =>
	date ? `<lastmod>${date.slice(0, 10)}</lastmod>` : '';

/** The section names, for prerendering /sitemaps/[name].xml. */
export const sitemapNames = () => Object.keys(sections());

export function sitemapIndexXml(): string {
	const items = Object.entries(sections()).map(([name, entries]) => {
		const newest = entries
			.map((entry) => entry.lastmod)
			.filter((date): date is string => Boolean(date))
			.sort()
			.at(-1);
		return `<sitemap>${loc(`/sitemaps/${name}.xml`)}${lastmod(newest)}</sitemap>`;
	});
	return `${XML}\n<sitemapindex xmlns="${NS}">\n${items.join('\n')}\n</sitemapindex>\n`;
}

export function sitemapXml(name: string): string {
	const entries = sections()[name];
	if (!entries) error(404, `No sitemap called "${name}"`);
	const urls = entries.map((entry) => `<url>${loc(entry.path)}${lastmod(entry.lastmod)}</url>`);
	return `${XML}\n<urlset xmlns="${NS}">\n${urls.join('\n')}\n</urlset>\n`;
}
