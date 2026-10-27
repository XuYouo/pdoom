<script lang="ts">
	// Shows trusted HTML only: what GitHub rendered from a markdown file (shared/api/github),
	// already sanitised by GitHub, or what entities/knowledge rendered at build time from this
	// repository's own markdown. Never pass it anything a visitor or a third party wrote.
	interface Props {
		html: string;
		class?: string;
	}

	let { html, class: className = '' }: Props = $props();
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- GitHub-sanitised markdown, see above -->
<div class="markdown {className}">{@html html}</div>

<style>
	.markdown {
		line-height: 1.7;
		overflow-wrap: anywhere;
	}
	.markdown :global(:where(p, ul, ol, pre, table, blockquote, details, .markdown-heading)) {
		margin-block: 1rem;
	}
	.markdown :global(:where(h2, h3, h4, h5, h6)) {
		font-family: var(--font-retro);
		line-height: 1.6;
		margin: 0;
	}
	.markdown :global(h2) {
		font-size: 1.25rem;
		padding-bottom: 0.75rem;
		border-bottom: 4px dashed var(--pixel);
	}
	.markdown :global(h3) {
		font-size: 1rem;
		padding-bottom: 0.5rem;
		border-bottom: 4px solid var(--pixel);
	}
	.markdown :global(:where(h4, h5, h6)) {
		font-size: 0.75rem;
		color: var(--primary-ink);
	}
	.markdown :global(.markdown-heading) {
		margin-top: 2.5rem;
		position: relative;
		scroll-margin-top: 6rem;
	}
	.markdown :global(:where(h2, h3, h4, h5, h6)[id]),
	.markdown :global(.anchor[id]) {
		scroll-margin-top: 6rem;
	}
	/* GitHub's permalink icon: kept for keyboard and pointer users, shown on hover/focus. */
	.markdown :global(.anchor) {
		position: absolute;
		left: -1.5rem;
		top: 0.25rem;
		opacity: 0;
		color: var(--muted-foreground);
	}
	.markdown :global(.markdown-heading:hover .anchor),
	.markdown :global(.anchor:focus-visible) {
		opacity: 1;
	}
	.markdown :global(.anchor svg) {
		fill: currentColor;
	}
	.markdown :global(a:not(.anchor)) {
		color: var(--foreground);
		text-decoration: underline;
		text-decoration-color: var(--accent);
		text-decoration-thickness: 2px;
		text-underline-offset: 4px;
	}
	.markdown :global(a:not(.anchor):hover) {
		background: color-mix(in oklab, var(--accent) 22%, transparent);
	}
	.markdown :global(:where(ul, ol)) {
		padding-left: 1.5rem;
	}
	.markdown :global(ul) {
		list-style: square;
	}
	.markdown :global(::marker) {
		color: var(--accent-ink);
	}
	.markdown :global(ol) {
		list-style: decimal;
	}
	.markdown :global(li + li) {
		margin-top: 0.35rem;
	}
	.markdown :global(blockquote) {
		border-left: 6px solid var(--accent);
		background: color-mix(in oklab, var(--muted) 70%, transparent);
		padding: 0.75rem 1rem;
		color: var(--muted-foreground);
	}
	.markdown :global(blockquote > :first-child) {
		margin-top: 0;
	}
	.markdown :global(blockquote > :last-child) {
		margin-bottom: 0;
	}
	.markdown :global(:not(pre) > code) {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.875em;
		background: var(--muted);
		border: 2px solid var(--border);
		padding: 0.05rem 0.35rem;
	}
	.markdown :global(pre) {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.875rem;
		line-height: 1.6;
		background: var(--card);
		border: 4px solid var(--pixel);
		box-shadow:
			inset 0 0 0 2px var(--muted),
			4px 4px 0 var(--title-depth);
		padding: 1rem 1.25rem;
		overflow-x: auto;
		overflow-wrap: normal;
	}
	/* GitHub wraps code blocks in a div that carries a copy button driven by its own script. */
	.markdown :global(clipboard-copy),
	.markdown :global(.zeroclipboard-container) {
		display: none;
	}
	.markdown :global(table) {
		display: block;
		overflow-x: auto;
		border-collapse: collapse;
		border: 4px solid var(--pixel);
	}
	.markdown :global(:where(th, td)) {
		border: 2px solid var(--border);
		padding: 0.5rem 0.75rem;
		text-align: left;
		vertical-align: top;
	}
	.markdown :global(th) {
		background: var(--muted);
		border-bottom: 4px solid var(--pixel);
		font-weight: 600;
	}
	.markdown :global(tbody tr:nth-child(even)) {
		background: color-mix(in oklab, var(--muted) 45%, transparent);
	}
	.markdown :global(img) {
		display: inline-block;
		max-width: 100%;
		height: auto;
		image-rendering: pixelated;
	}
	/* Badges are vector text, not pixel art; GitHub proxies external ones (shields.io) via camo. */
	.markdown :global(img[src*='camo.githubusercontent.com']),
	.markdown :global(img[src*='badge.svg']) {
		image-rendering: auto;
	}
	.markdown :global(details) {
		border: 2px dashed var(--border);
		padding: 0.5rem 1rem;
	}
	.markdown :global(summary) {
		cursor: pointer;
	}
	.markdown :global(hr) {
		border: 0;
		border-top: 4px solid var(--pixel);
		margin-block: 2rem;
	}
	.markdown :global([align='center']) {
		text-align: center;
	}
	.markdown :global(sub) {
		color: var(--muted-foreground);
	}
</style>
