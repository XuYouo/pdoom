import { Lexer, Marked, Parser, TextRenderer, type Tokens } from 'marked';
import { REPO_URL } from '#shared/lib/site.js';
import type { ArticleHeading, RenderedMarkdown } from '../model/types';
import { gridFigure } from './grid';
import { escapeHtml } from './html';

/**
 * Renders the repository's own markdown (rules, skills, agents) to HTML at build time. The
 * source is this checkout, never user input, which is what lets the page print it unsanitised.
 *
 * What the agent-facing text needs to become a web page:
 * - ```grid blocks are drawn as pixel pictures (`gridFigure`);
 * - `rules://name` and `skill://name` — how agents address each other's files — become links
 *   to the page for that file, but only when the site has that page, so a stale reference
 *   stays plain code instead of a link that fails the prerender;
 * - relative links resolve against the file's place in the repository: to the site's own page
 *   when there is one, otherwise to the file on GitHub;
 * - headings get GitHub-style ids and permalinks, and h2/h3 are collected for the outline.
 */
export interface MarkdownContext {
	/** Repository path of the file being rendered (`rules/12-anti-aliasing.md`). */
	path: string;
	/** Maps a repository path (`rules/12-anti-aliasing.md`) to its knowledge-base page, if any. */
	pageFor: (repoPath: string) => string | undefined;
}

const AGENT_URI = /^(rules|skill):\/\/([\w-]+)$/;

function slugify(text: string): string {
	return (
		text
			.toLowerCase()
			.trim()
			.replace(/[^\p{L}\p{N}\s-]/gu, '')
			.replace(/\s/g, '-') || 'section'
	);
}

export function renderMarkdown(source: string, context: MarkdownContext): RenderedMarkdown {
	const headings: ArticleHeading[] = [];
	const ids = new Map<string, number>();
	const fileUrl = new URL(context.path, 'repo:/');

	const agentUriPage = (uri: string) => {
		const match = AGENT_URI.exec(uri);
		if (!match) return undefined;
		const [, scheme, name] = match;
		if (scheme === 'rules') {
			return name === 'index' ? '/knowledge' : context.pageFor(`rules/${name}.md`);
		}
		return context.pageFor(`skills/${name}/SKILL.md`);
	};

	const resolveHref = (href: string): string => {
		const page = agentUriPage(href);
		if (page) return page;
		if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('#')) return href;
		const target = new URL(href, fileUrl);
		const repoPath = decodeURIComponent(target.pathname.replace(/^\//, ''));
		return (context.pageFor(repoPath) ?? `${REPO_URL}/blob/main/${repoPath}`) + target.hash;
	};

	const marked = new Marked({
		gfm: true,
		renderer: {
			heading({ tokens, depth }: Tokens.Heading) {
				const inner = this.parser.parseInline(tokens);
				const text = this.parser.parseInline(tokens, this.parser.textRenderer);
				const base = slugify(text);
				const seen = ids.get(base) ?? 0;
				ids.set(base, seen + 1);
				const id = seen === 0 ? base : `${base}-${seen}`;
				if (depth === 2 || depth === 3) headings.push({ id, text, depth });
				return (
					`<div class="markdown-heading"><h${depth} id="${id}">${inner}</h${depth}>` +
					`<a class="anchor" href="#${id}" aria-label="Permalink: ${escapeHtml(text)}">#</a></div>`
				);
			},
			code({ text, lang }: Tokens.Code) {
				const info = (lang ?? '').trim();
				const grid = /^grid\s+(\S+)/.exec(info);
				if (grid) return gridFigure(grid[1]!, text);
				const language = info.split(/\s+/)[0];
				const attr = language ? ` class="language-${escapeHtml(language)}"` : '';
				return `<pre><code${attr}>${escapeHtml(text)}</code></pre>`;
			},
			codespan({ text }: Tokens.Codespan) {
				const code = `<code>${escapeHtml(text)}</code>`;
				const page = agentUriPage(text);
				return page ? `<a href="${page}" class="kb-ref">${code}</a>` : code;
			},
			link({ href, title, tokens }: Tokens.Link) {
				const target = resolveHref(href);
				const external = /^https?:/.test(target);
				return (
					`<a href="${escapeHtml(target)}"` +
					(title ? ` title="${escapeHtml(title)}"` : '') +
					(external ? ' rel="noopener"' : '') +
					`>${this.parser.parseInline(tokens)}</a>`
				);
			}
		}
	});

	const html = marked.parse(source, { async: false });
	return { html, headings };
}

/** Markdown inline text as plain text, for summaries and meta descriptions. */
export function plainText(markdown: string): string {
	return new Parser()
		.parseInline(Lexer.lexInline(markdown), new TextRenderer())
		.replace(/\s+/g, ' ')
		.trim();
}
