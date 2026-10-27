<script lang="ts">
	import { PLUGIN_NAME, SITE_URL } from '#shared/lib/site.js';
	import { Seo } from '#shared/ui/seo/index.js';
	import { resolve } from '$app/paths';
	import ArrowLeftIcon from '~icons/pixelarticons/arrow-left';
	import DownloadIcon from '~icons/pixelarticons/download';
	import ExternalLinkIcon from '~icons/pixelarticons/external-link';
	import { Badge, Button } from '#shared/ui/8bit/index.js';
	import { FileImage, ScoreMeter } from '#entities/generation/index.js';
	import { sequenceText } from '#entities/prompt/index.js';
	import { CopyButton } from '#features/copyPrompt/index.js';
	import { PromptTimeline } from '#widgets/promptTimeline/index.js';
	import { formatDate } from '#shared/lib/format.js';
	import { saveFrom } from '#shared/lib/download.js';
	import type { GenerationPageData } from '../model/types';
	import GenerationFiles from './GenerationFiles.svelte';
	import MoreViews from './MoreViews.svelte';
	import ValidateReports from './ValidateReports.svelte';
	import CraftRatings from './CraftRatings.svelte';
	import RunMetrics from './RunMetrics.svelte';

	interface Props {
		data: GenerationPageData;
	}

	let { data }: Props = $props();

	const g = $derived(data.generation);

	const source = $derived(g.files.find((file) => file.role === 'source'));
	const passed = $derived(g.results.filter((result) => result.pass).length);
	const modelSteps = $derived(
		g.models.map((model) => ({
			model,
			steps: g.steps.flatMap((step, index) =>
				step.model === model || (!step.model && g.models.length === 1) ? [index + 1] : []
			)
		}))
	);
	// Social cards need an absolute URL and at least ~300px across; a smaller cover falls back
	// to the site card rather than being upscaled by the platform into a blur.
	const cardImage = $derived(
		(g.cover.width ?? 0) >= 300
			? g.cover.url.startsWith('http')
				? g.cover.url
				: `${SITE_URL}${g.cover.url}`
			: undefined
	);
</script>

<Seo
	title={g.title}
	description={g.description ??
		`${g.title}, drawn by ${g.modelLabel} with ${PLUGIN_NAME} v${g.plugin}.`}
	type="article"
	image={cardImage}
	imageAlt={g.title}
	jsonLd={{
		'@context': 'https://schema.org',
		'@type': 'VisualArtwork',
		name: g.title,
		...(g.description ? { description: g.description } : {}),
		artform: 'Pixel art',
		dateCreated: g.date,
		url: `${SITE_URL}/g/${g.id}`,
		...(cardImage ? { image: cardImage } : {}),
		creator: { '@type': 'SoftwareApplication', name: PLUGIN_NAME, softwareVersion: g.plugin }
	}}
/>

<div class="mx-auto max-w-6xl px-4 pt-8 pb-8 sm:px-6 sm:pt-10">
	<nav
		aria-label="Breadcrumb"
		class="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground"
	>
		<a href={resolve('gallery')} class="inline-flex h-11 items-center gap-1.5 hover:text-foreground"
			><ArrowLeftIcon aria-hidden="true" />Gallery</a
		>
		{#if g.pack}
			<span aria-hidden="true">/</span>
			<a
				href={resolve('/packs/[id]', { id: g.pack.id })}
				class="inline-flex h-11 items-center hover:text-foreground"
				>Pack: <span class="ml-1 text-foreground underline underline-offset-4">{g.pack.title}</span
				></a
			>
		{/if}
	</nav>

	<div
		class="page-hero mt-4 grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16"
	>
		<div class="self-start px-1.5 lg:sticky lg:top-24">
			<div
				class="pixel-frame canvas-checker overflow-hidden"
				style:view-transition-name="art-{g.id}"
			>
				<FileImage file={g.cover} alt={g.title} minHeight={280} eager zoomable />
			</div>
		</div>

		<div class="min-w-0">
			<p class="eyebrow">{g.modelLabel}</p>
			<h1 class="title-depth mt-5 text-2xl leading-snug sm:text-3xl sm:leading-snug">{g.title}</h1>
			{#if g.description}
				<p class="lead mt-5">{g.description}</p>
			{/if}

			<div class="mt-8 flex flex-wrap gap-4 px-1.5">
				{#if source}
					<Button
						href={source.url}
						download={source.name}
						data-sound="confirm"
						onclick={(event: MouseEvent) => saveFrom(event, source.url, source.name)}
						variant="accent"
					>
						<DownloadIcon aria-hidden="true" />
						Download .aseprite
					</Button>
				{/if}
				<CopyButton
					text={sequenceText(g.steps)}
					label={g.steps.length > 1 ? 'Copy full prompt' : 'Copy prompt'}
					done="Copied the full prompt"
					variant={source ? 'outline' : 'accent'}
					size="default"
				/>
			</div>

			{#if g.benchmark}
				<div class="plate mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
					<div class="min-w-0 space-y-1">
						<p class="retro text-[0.625rem] tracking-widest text-muted-foreground uppercase">
							Benchmark
						</p>
						<p>
							<a
								href={resolve('/benchmarks/[prompt]', { prompt: g.benchmark.prompt })}
								class="font-medium underline underline-offset-4"
							>
								{g.benchmark.promptTitle}
							</a>
							<span class="text-sm text-muted-foreground">revision {g.benchmark.revision}</span>
						</p>
						{#if g.outdated}
							<Badge variant="outline" class="text-[0.625rem]">Older revision, unranked</Badge>
						{/if}
						{#if g.score}
							<p class="text-xs text-muted-foreground tabular-nums">
								{g.score.passed}/{g.score.total} criteria{g.outdated
									? ' · older revision, not ranked'
									: ''}
							</p>
						{/if}
					</div>
					{#if g.points !== null}
						<div class="ml-auto"><ScoreMeter points={g.points} size="lg" /></div>
					{/if}
				</div>
			{/if}

			<dl
				class="plate mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 px-5 py-5 text-[0.95rem] [&>dt]:pt-0.5 [&>dt]:text-sm [&>dt]:text-muted-foreground"
			>
				<dt>Author</dt>
				<dd>
					{#if g.author.github}
						<a
							href="https://github.com/{g.author.github}"
							class="underline underline-offset-4"
							rel="noopener"
						>
							{g.author.name}
						</a>
						<span class="text-muted-foreground">@{g.author.github}</span>
					{:else}
						{g.author.name}
					{/if}
				</dd>
				<dt>Date</dt>
				<dd><time datetime={g.date} class="tabular-nums">{formatDate(g.date)}</time></dd>
				<dt>Plugin</dt>
				<dd class="tabular-nums">v{g.plugin}</dd>
				<dt>Harness</dt>
				<dd>{g.harness}</dd>
				<dt>{g.models.length === 1 ? 'Model' : 'Models'}</dt>
				<dd>
					<ul class="space-y-1">
						{#each modelSteps as entry (entry.model)}
							<li>
								<span class="font-medium">{entry.model}</span>
								{#if g.steps.length > 1 && entry.steps.length > 0}
									<span class="text-muted-foreground">
										ran {entry.steps.length === g.steps.length
											? 'every step'
											: `step ${entry.steps.join(' and ')}`}
									</span>
								{/if}
							</li>
						{/each}
					</ul>
				</dd>
				<dt>Reference</dt>
				<dd>
					{#if g.references.source === 'generated'}
						{g.references.kinds.join(', ')} generated by
						<span class="font-medium">{g.references.imageModels.join(' + ')}</span>
					{:else if g.references.source === 'supplied'}
						{g.references.kinds.join(', ')} supplied by the author
					{:else}
						none — drawn from the prompt alone
					{/if}
					{#if g.references.prompt}
						<details class="mt-1">
							<summary class="cursor-pointer text-muted-foreground">Image-model prompt</summary>
							<pre class="mt-1 text-xs whitespace-pre-wrap">{g.references.prompt}</pre>
						</details>
					{/if}
				</dd>
				{#if g.tags.length > 0}
					<dt>Tags</dt>
					<dd class="flex flex-wrap gap-3">
						{#each g.tags as tag (tag)}
							<Badge
								variant="secondary"
								href="{resolve('gallery')}?tag={encodeURIComponent(tag)}"
								class="text-[0.625rem]">{tag}</Badge
							>
						{/each}
					</dd>
				{/if}
			</dl>

			<div class="mt-6 flex flex-wrap gap-4 px-1.5">
				<CopyButton text={g.yaml} label="Copy YAML" done="Copied generation.yaml" variant="ghost" />
				<Button href={g.githubUrl} variant="ghost" rel="noopener">
					<ExternalLinkIcon aria-hidden="true" />
					On GitHub
				</Button>
			</div>
		</div>
	</div>

	<div class="pixel-rule mt-20 opacity-40" aria-hidden="true"></div>

	<div class="mt-16 max-w-3xl px-1.5">
		<PromptTimeline
			prompt={{ id: g.id, steps: g.steps, setup: { rules: [] } }}
			heading={g.steps.some((step) => step.original)
				? 'The prompts, in English'
				: 'The prompts, verbatim'}
		/>
	</div>

	{#if g.results.length > 0 || g.validate.length > 0}
		<section
			class="mt-24 grid grid-cols-[minmax(0,1fr)] gap-16 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"
		>
			<div>
				{#if g.results.length > 0}
					<section aria-labelledby="results">
						<h2 id="results" class="section-title text-lg sm:text-2xl">Benchmark results</h2>
						<p class="mt-4 text-sm text-muted-foreground">
							<span class="retro text-xs text-foreground tabular-nums" aria-hidden="true"
								>{passed}/{g.results.length}</span
							>
							{passed} of {g.results.length} criteria passed.
						</p>
						<ul class="mt-6 space-y-3">
							{#each g.results as result (result.criterion)}
								<li
									class={[
										'flex gap-4 border-l-4 bg-muted/40 py-3 pr-4 pl-4',
										result.pass ? 'border-secondary' : 'border-pico-red'
									]}
								>
									<span
										class={[
											'mt-0.5 grid size-7 shrink-0 place-items-center',
											result.pass
												? 'bg-secondary text-secondary-foreground'
												: 'bg-pico-red text-black'
										]}
									>
										{#if result.pass}
											<svg
												viewBox="0 0 16 16"
												width="14"
												height="14"
												shape-rendering="crispEdges"
												aria-hidden="true"
											>
												<rect x="3" y="8" width="3" height="2" fill="currentColor"></rect>

												<rect x="5" y="10" width="3" height="2" fill="currentColor"></rect>

												<rect x="6" y="6" width="3" height="2" fill="currentColor"></rect>

												<rect x="8" y="4" width="3" height="2" fill="currentColor"></rect>

												<rect x="10" y="2" width="3" height="2" fill="currentColor"></rect>
											</svg>
										{:else}
											<svg
												viewBox="0 0 16 16"
												width="14"
												height="14"
												shape-rendering="crispEdges"
												aria-hidden="true"
											>
												<rect x="3" y="3" width="3" height="2" fill="currentColor"></rect>

												<rect x="3" y="5" width="3" height="2" fill="currentColor"></rect>

												<rect x="3" y="7" width="3" height="2" fill="currentColor"></rect>

												<rect x="3" y="9" width="3" height="2" fill="currentColor"></rect>

												<rect x="3" y="11" width="3" height="2" fill="currentColor"></rect>

												<rect x="5" y="3" width="3" height="2" fill="currentColor"></rect>

												<rect x="7" y="3" width="3" height="2" fill="currentColor"></rect>

												<rect x="9" y="3" width="3" height="2" fill="currentColor"></rect>

												<rect x="11" y="3" width="3" height="2" fill="currentColor"></rect>
											</svg>
										{/if}
										<span class="sr-only">{result.pass ? 'Passed' : 'Failed'}:</span>
									</span>
									<div class="min-w-0 text-sm">
										<p>{result.text ?? result.criterion}</p>
										<p class="mt-1 text-xs text-muted-foreground">
											<span
												class={[
													'retro text-[0.625rem] tracking-wider uppercase',
													result.pass ? 'text-foreground' : 'text-destructive'
												]}
												aria-hidden="true">{result.pass ? 'Pass' : 'Fail'}</span
											>
											·
											{#if result.step}Step {result.step},
											{/if}<code>{result.criterion}</code>
										</p>
										{#if result.note}
											<p class="mt-2 border-l-2 border-pixel pl-2.5 text-muted-foreground">
												{result.note}
											</p>
										{/if}
									</div>
								</li>
							{/each}
						</ul>
					</section>
				{/if}
			</div>

			<div class="space-y-12">
				<ValidateReports reports={g.validate} />
			</div>
		</section>
	{/if}

	<section class="mt-24 flex min-w-0 flex-col gap-20">
		<CraftRatings ratings={g.ratings} craft={g.craft} />
		<RunMetrics metrics={g.metrics} />
	</section>

	<div class="mt-24">
		<MoreViews generation={g} />
	</div>

	<div class="mt-24">
		<GenerationFiles files={g.files} />
	</div>
</div>
