import { gallery } from '#entities/generation/index.server.js';
import { knowledgePath } from '#entities/knowledge/index.js';
import { palettes, rules } from '#entities/knowledge/index.server.js';
import { agents, docs, skills } from '#entities/plugin/index.server.js';
import {
	INSTALL_DOC_URL,
	NPM_PACKAGE,
	NPM_URL,
	PLUGIN_NAME,
	REPO_URL,
	SITE_NAME,
	SITE_URL
} from '#shared/lib/site.js';

// https://llmstxt.org: a markdown map of the site for language models. /llms.txt is the short
// index with links; /llms-full.txt inlines the README, the install guide and every skill so a
// model can answer from one fetch. Both are prerendered, so they match the deployed commit.

const SUMMARY = `${PLUGIN_NAME} is an open-source MCP server and Claude Code plugin that lets AI coding agents draw pixel art, animate sprites and export spritesheets in the user's open Aseprite window, one undoable step at a time. ${SITE_NAME} (${SITE_URL}) is its site: a gallery of pieces made with it, with the exact prompts, models and .aseprite files, and a benchmark that scores models on the same fixed pixel-art tasks.`;

function header(): string {
	return `# ${SITE_NAME}: ${PLUGIN_NAME}\n\n> ${SUMMARY}\n\nInstall: \`npx ${NPM_PACKAGE} install-extension\`, then connect your agent (Claude Code: \`/plugin marketplace add with-pebbly/aseprite-ai-artist\` and \`/plugin install aseprite@aseprite-ai-artist\`). Works with Claude Code, omp, Codex CLI, Gemini CLI, Cursor, VS Code and Windsurf. Requires Aseprite 1.3+ and Node.js 22.6+. MIT licensed.\n`;
}

export function llmsTxt(): string {
	const { prompts, packs } = gallery();
	const lines = [
		header(),
		'## Plugin',
		'',
		`- [${PLUGIN_NAME}](${SITE_URL}/plugin): what it does, skills, agents, the README`,
		`- [Install guide](${SITE_URL}/plugin/install): three commands, then every agent and setup`,
		`- [Source on GitHub](${REPO_URL})`,
		`- [npm package](${NPM_URL})`,
		`- [Full install guide (markdown)](${INSTALL_DOC_URL})`,
		'',
		'## Skills',
		'',
		...skills().map((skill) => `- [/aseprite:${skill.name}](${skill.url}): ${skill.description}`),
		'',
		'## Agents',
		'',
		...agents().map((agent) => `- [${agent.name}](${agent.url}): ${agent.description}`),
		'',
		'## Knowledge base',
		'',
		`- [Pixel-art knowledge base](${SITE_URL}/knowledge): the rulebook the agents follow, with pixel templates, plus every skill, agent and bundled palette`,
		`- [${palettes().length} palettes](${SITE_URL}/knowledge/palettes): every palette \`palette\` op \`preset\` loads by key, with author and source`,
		...rules().map(
			(rule) =>
				`- [${rule.title}](${SITE_URL}${knowledgePath('rules', rule.slug)}): ${rule.summary}`
		),
		'',
		'## Gallery and benchmark',
		'',
		`- [Gallery](${SITE_URL}/gallery): every piece, with prompts, model, plugin version and source files`,
		...packs.map(
			(pack) =>
				`- [Pack: ${pack.title}](${SITE_URL}/packs/${pack.id}): ${pack.description ?? `${pack.generations.length} pieces`}`
		),
		`- [Benchmarks](${SITE_URL}/benchmarks): fixed tasks, scored criterion by criterion`,
		...prompts.map((prompt) => `- [${prompt.title}](${SITE_URL}/benchmarks/${prompt.id})`),
		`- [Contribute](${SITE_URL}/contribute): add your own piece with \`/aseprite:submit\``,
		'',
		'## Optional',
		'',
		`- [Everything in one file](${SITE_URL}/llms-full.txt): README, install guide and all skills inlined`,
		`- [Sitemap](${SITE_URL}/sitemap.xml)`,
		''
	];
	return lines.join('\n');
}

export function llmsFullTxt(): string {
	const skillList = skills()
		.map(
			(skill) =>
				`### /aseprite:${skill.name}: ${skill.title}\n\n${skill.description}\n\nSource: ${skill.url}`
		)
		.join('\n\n');
	const agentList = agents()
		.map((agent) => `### ${agent.name}\n\n${agent.description}\n\nSource: ${agent.url}`)
		.join('\n\n');
	return [
		header(),
		'## README',
		'',
		docs.readme.trim(),
		'',
		'## Install guide (docs/INSTALL.md)',
		'',
		docs.installGuide.trim(),
		'',
		'## Skills',
		'',
		skillList,
		'',
		'## Agents',
		'',
		agentList,
		''
	].join('\n');
}
