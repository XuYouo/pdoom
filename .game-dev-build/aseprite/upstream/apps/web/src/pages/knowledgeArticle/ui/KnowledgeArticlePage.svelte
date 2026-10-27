<script lang="ts">
	import { resolve } from '$app/paths';
	import ArrowLeftIcon from '~icons/pixelarticons/arrow-left';
	import ArrowRightIcon from '~icons/pixelarticons/arrow-right';
	import GithubIcon from '~icons/pixelarticons/github';
	import GridIcon from '~icons/pixelarticons/grid';
	import { Markdown } from '#shared/ui/markdown/index.js';
	import { Seo } from '#shared/ui/seo/index.js';
	import { SITE_NAME, SITE_URL } from '#shared/lib/site.js';
	import type { KnowledgeArticlePageData } from '../model/types';
	import KnowledgeNav from './KnowledgeNav.svelte';
	import PageOutline from './PageOutline.svelte';

	interface Props {
		data: KnowledgeArticlePageData;
	}

	let { data }: Props = $props();

	const path = $derived(`/knowledge/${data.section}/${data.slug}`);
	// The index section this page is listed in: a rule's band (`12-…` is in `1x`), or skills/agents.
	const sectionAnchor = $derived(data.section === 'rules' ? `band-${data.slug[0]}x` : data.section);
	const kind = $derived(
		data.section === 'rules' ? 'Rule' : data.section === 'skills' ? 'Skill' : 'Agent'
	);

	const jsonLd = $derived([
		{
			'@context': 'https://schema.org',
			'@type': 'TechArticle',
			headline: data.title,
			description: data.description,
			url: `${SITE_URL}${path}`,
			isBasedOn: data.sourceUrl,
			isPartOf: { '@type': 'CollectionPage', name: 'Knowledge base', url: `${SITE_URL}/knowledge` }
		},
		{
			'@context': 'https://schema.org',
			'@type': 'BreadcrumbList',
			itemListElement: [
				{ '@type': 'ListItem', position: 1, name: SITE_NAME, item: SITE_URL },
				{
					'@type': 'ListItem',
					position: 2,
					name: 'Knowledge base',
					item: `${SITE_URL}/knowledge`
				},
				{
					'@type': 'ListItem',
					position: 3,
					name: data.sectionTitle,
					item: `${SITE_URL}/knowledge#${sectionAnchor}`
				},
				{ '@type': 'ListItem', position: 4, name: data.title, item: `${SITE_URL}${path}` }
			]
		}
	]);
</script>

<Seo
	title="{data.title} · {kind === 'Rule' ? 'Pixel-art rules' : `${kind}s`}"
	description={data.description}
	type="article"
	{jsonLd}
/>

<div class="mx-auto max-w-7xl px-4 pt-8 pb-24 sm:px-6 lg:px-10">
	<nav aria-label="Breadcrumb" class="text-sm text-muted-foreground">
		<ol class="flex flex-wrap items-center gap-x-2 gap-y-1">
			<li>
				<a
					href={resolve('/knowledge')}
					class="inline-flex min-h-11 items-center underline-offset-4 hover:text-foreground hover:underline"
					>Knowledge base</a
				>
			</li>
			<li aria-hidden="true">/</li>
			<li>
				<a
					href="{resolve('/knowledge')}#{sectionAnchor}"
					class="inline-flex min-h-11 items-center underline-offset-4 hover:text-foreground hover:underline"
					>{data.sectionTitle}</a
				>
			</li>
			<li aria-hidden="true">/</li>
			<li aria-current="page" class="text-foreground">{data.title}</li>
		</ol>
	</nav>

	<div
		class="mt-6 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-12 xl:grid-cols-[16rem_minmax(0,1fr)_13rem]"
	>
		<aside class="hidden lg:block" aria-label="Knowledge base">
			<div
				class="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain border-r-4 border-dashed border-border pr-4 pb-8"
			>
				<KnowledgeNav groups={data.nav} current={path} />
			</div>
		</aside>

		<article class="min-w-0">
			<details class="kb-disclosure mb-8 border-4 border-pixel bg-card/80 lg:hidden">
				<summary class="flex min-h-12 cursor-pointer items-center px-4 retro text-[0.625rem]">
					Browse the knowledge base
				</summary>
				<div class="max-h-[60dvh] overflow-y-auto border-t-4 border-pixel px-4 py-3">
					<KnowledgeNav groups={data.nav} current={path} />
				</div>
			</details>

			<header class="page-hero max-w-[70ch]">
				<p class="eyebrow">{kind}</p>
				<code class="mt-4 block retro text-[0.625rem] break-all text-primary-ink"
					>{data.address}</code
				>
				<h1 class="title-depth mt-5 text-xl leading-snug sm:text-3xl sm:leading-snug">
					{data.title}
				</h1>
				<Markdown html={data.lead} class="lead mt-6 [&_p]:m-0" />
				<div
					class="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t-4 border-dashed border-border pt-4 text-sm text-muted-foreground"
				>
					{#if data.templates > 0}
						<span class="inline-flex items-center gap-1.5">
							<GridIcon aria-hidden="true" />
							{data.templates === 1 ? '1 pixel template' : `${data.templates} pixel templates`}
						</span>
					{/if}
					<a
						href={data.sourceUrl}
						rel="noopener"
						class="inline-flex min-h-11 items-center gap-1.5 underline-offset-4 hover:text-foreground hover:underline"
					>
						<GithubIcon aria-hidden="true" />
						{data.sourcePath}
					</a>
				</div>
			</header>

			{#if data.headings.length > 2}
				<details class="kb-disclosure mt-8 max-w-[70ch] border-4 border-pixel bg-card/80 xl:hidden">
					<summary class="flex min-h-12 cursor-pointer items-center px-4 retro text-[0.625rem]">
						On this page
					</summary>
					<div class="border-t-4 border-pixel px-4 py-3">
						<PageOutline headings={data.headings} />
					</div>
				</details>
			{/if}

			<Markdown html={data.html} class="kb-article mt-6 max-w-[70ch]" />

			{#if data.previous || data.next}
				<nav aria-label="{data.sectionTitle}, previous and next" class="mt-16 max-w-[70ch]">
					<ul class="grid gap-4 sm:grid-cols-2">
						<li>
							{#if data.previous}
								<a
									href={data.previous.href}
									rel="prev"
									class="group pixel-frame flex h-full flex-col gap-2 bg-card p-4 transition-colors hover:bg-muted"
								>
									<span class="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
										<ArrowLeftIcon aria-hidden="true" />Previous
									</span>
									<span class="font-semibold underline-offset-4 group-hover:underline">
										{#if data.previous.marker}<span class="text-muted-foreground"
												>{data.previous.marker}</span
											>
										{/if}{data.previous.label}
									</span>
								</a>
							{/if}
						</li>
						<li>
							{#if data.next}
								<a
									href={data.next.href}
									rel="next"
									class="group pixel-frame flex h-full flex-col items-end gap-2 bg-card p-4 text-right transition-colors hover:bg-muted"
								>
									<span class="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
										Next<ArrowRightIcon aria-hidden="true" />
									</span>
									<span class="font-semibold underline-offset-4 group-hover:underline">
										{#if data.next.marker}<span class="text-muted-foreground"
												>{data.next.marker}</span
											>
										{/if}{data.next.label}
									</span>
								</a>
							{/if}
						</li>
					</ul>
				</nav>
			{/if}
		</article>

		{#if data.headings.length > 0}
			<aside class="hidden xl:block" aria-labelledby="outline-title">
				<div class="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pb-8">
					<h2 id="outline-title" class="retro text-[0.625rem] text-muted-foreground">
						On this page
					</h2>
					<div class="mt-4">
						<PageOutline headings={data.headings} />
					</div>
				</div>
			</aside>
		{/if}
	</div>
</div>

<style>
	/* The disclosure's own marker is replaced by a pixel chevron that turns when open. */
	.kb-disclosure > summary {
		list-style: none;
	}
	.kb-disclosure > summary::-webkit-details-marker {
		display: none;
	}
	.kb-disclosure > summary::after {
		content: '';
		margin-left: auto;
		width: 10px;
		height: 6px;
		background: currentColor;
		clip-path: polygon(
			0 0,
			100% 0,
			100% 33%,
			80% 33%,
			80% 67%,
			60% 67%,
			60% 100%,
			40% 100%,
			40% 67%,
			20% 67%,
			20% 33%,
			0 33%
		);
	}
	.kb-disclosure[open] > summary::after {
		transform: rotate(180deg);
	}

	/* Pixel templates from the rule files (entities/knowledge/lib/grid.ts). */
	:global(.kb-article .kb-grid) {
		margin-block: 1.5rem;
		border: 4px solid var(--pixel);
		background: var(--card);
	}
	:global(.kb-article .kb-grid-art) {
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 1.25rem;
		overflow-x: auto;
	}
	:global(.kb-article .kb-grid-art svg) {
		display: block;
		max-width: 100%;
		height: auto;
		image-rendering: pixelated;
	}
	:global(.kb-article .kb-grid figcaption) {
		border-top: 4px solid var(--pixel);
		padding: 0.75rem 1rem;
		font-size: 0.875rem;
	}
	:global(.kb-article .kb-grid-legend) {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		margin: 0.5rem 0 0;
		padding: 0;
		list-style: none;
		color: var(--muted-foreground);
	}
	:global(.kb-article .kb-grid-legend li) {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		margin: 0;
	}
	:global(.kb-article .kb-swatch) {
		width: 0.875rem;
		height: 0.875rem;
		border: 2px solid var(--pixel);
		flex-shrink: 0;
	}
	:global(.kb-article .kb-grid details) {
		margin: 0;
		border: 0;
		border-top: 2px dashed var(--border);
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
	}
	:global(.kb-article .kb-grid pre) {
		margin-block: 0.5rem;
		line-height: 1.15;
	}
	:global(.kb-article a.kb-ref) {
		text-decoration-color: var(--primary-ink);
	}
</style>
