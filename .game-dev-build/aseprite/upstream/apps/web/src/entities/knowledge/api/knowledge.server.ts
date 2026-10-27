import { REPO_URL } from '#shared/lib/site.js';
import presetFile from '../../../../../../knowledge/palettes.json';
import { plainText } from '../lib/markdown';
import type { PalettePreset, Rule, RuleBand } from '../model/types';

// Bundled from the checkout the site is built from, like the plugin's skills and agents: the
// knowledge base always shows the rulebook of the commit it was deployed with.
const ruleFiles = import.meta.glob<string>('../../../../../../rules/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
});

// The bands of ADR-0011, as the MCP server titles them in `rules://index` (src/server.ts,
// RULE_BANDS). The part after the dash is what the band covers.
const BANDS: Record<string, string> = {
	'0': 'Core discipline',
	'1': 'Technique — lines, clusters, anti-aliasing, dithering, readability',
	'2': 'Colour, light and materials',
	'3': 'Characters — proportions, anatomy, faces, eyes, hands, clothing, views',
	'4': 'Animation — timing, idle, walk and run, jumps, attacks, secondary motion',
	'5': 'Animals and creatures',
	'6': 'Environments — skies, landscapes, parallax, foliage, water, tiles, buildings',
	'7': 'Objects and 3D — perspective, isometric, forms, props, vehicles, rotation',
	'8': 'Effects and interface — VFX, game feel, particles, UI, fonts',
	'9': 'Style — platform eras, composition, tells of generated art'
};

interface ParsedRule {
	rule: Rule;
	/** The paragraph under the title, as markdown; the page shows it as the lead. */
	lead: string;
	/** Everything after the lead. */
	body: string;
}

/** A rule file is `# Title`, one paragraph of summary, then the sections (ADR-0011). */
function parseRule(slug: string, source: string): ParsedRule {
	const lines = source.split(/\r?\n/);
	const titleAt = lines.findIndex((line) => line.startsWith('# '));
	if (titleAt === -1) throw new Error(`rules/${slug}.md: no '# ' title`);
	let start = titleAt + 1;
	while (start < lines.length && !lines[start]!.trim()) start++;
	let end = start;
	while (end < lines.length && lines[end]!.trim() && !lines[end]!.startsWith('#')) end++;
	const lead = lines.slice(start, end).join('\n');
	return {
		rule: {
			slug,
			number: slug.slice(0, 2),
			title: lines[titleAt]!.slice(2).trim(),
			summary: plainText(lead),
			templates: (source.match(/^```grid\b/gm) ?? []).length,
			sourceUrl: `${REPO_URL}/blob/main/rules/${slug}.md`
		},
		lead,
		body: lines.slice(end).join('\n')
	};
}

let parsed: Map<string, ParsedRule> | undefined;

/** Every numbered rule file, in rulebook order. `rules/README.md` is about the folder, not a rule. */
function parsedRules(): Map<string, ParsedRule> {
	parsed ??= new Map(
		Object.entries(ruleFiles)
			.map(([file, source]) => [file.split('/').at(-1)!.replace(/\.md$/, ''), source] as const)
			.filter(([slug]) => /^\d\d-/.test(slug))
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([slug, source]) => [slug, parseRule(slug, source)])
	);
	return parsed;
}

export function rules(): Rule[] {
	return [...parsedRules().values()].map((entry) => entry.rule);
}

/** The rule with its lead and body as markdown, for its page. */
export function ruleSource(slug: string): ParsedRule | undefined {
	return parsedRules().get(slug);
}

export function ruleBands(): RuleBand[] {
	const bands: RuleBand[] = [];
	for (const rule of rules()) {
		const digit = rule.number[0]!;
		let band = bands.at(-1);
		if (band?.code !== `${digit}x`) {
			const [title, topics] = (BANDS[digit] ?? 'Other').split(' — ');
			band = { code: `${digit}x`, title: title!, ...(topics ? { topics } : {}), rules: [] };
			bands.push(band);
		}
		band.rules.push(rule);
	}
	return bands;
}

export function palettes(): PalettePreset[] {
	return Object.entries(presetFile.presets).map(([id, preset]) => ({ id, ...preset }));
}
