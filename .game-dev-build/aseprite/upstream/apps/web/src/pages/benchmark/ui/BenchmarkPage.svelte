<script lang="ts">
	import { Seo } from '#shared/ui/seo/index.js';
	import { resolve } from '$app/paths';
	import ArrowDownIcon from '~icons/pixelarticons/arrow-down';
	import ArrowLeftIcon from '~icons/pixelarticons/arrow-left';
	import SlidersIcon from '~icons/pixelarticons/sliders';
	import { Badge, Button } from '#shared/ui/8bit/index.js';
	import { PromptTimeline } from '#widgets/promptTimeline/index.js';
	import { GalleryGrid, type FilterKey } from '#features/filterGenerations/index.js';
	import { plural } from '#shared/lib/format.js';
	import type { BenchmarkPageData } from '../model/types';
	import BenchmarkMatrix from './BenchmarkMatrix.svelte';
	import ContenderCard from './ContenderCard.svelte';
	import PromptCriteria from './PromptCriteria.svelte';
	import PromptMethod from './PromptMethod.svelte';
	import RunProgress from './RunProgress.svelte';

	interface Props {
		data: BenchmarkPageData;
	}

	let { data }: Props = $props();

	const { benchmark, chips, contenders, runs, facets, modelOrder } = $derived(data);
	const prompt = $derived(benchmark.prompt);
	const winner = $derived(contenders[0]);
	/** The stage is the podium: the winner and at most two runners-up; the rest are in the ranking. */
	const runnersUp = $derived(contenders.slice(1, 3));
	const offStage = $derived(contenders.length - 1 - runnersUp.length);
	/** The summary's first sentence: what is being drawn. The rest explains the test, further down. */
	const lede = $derived(prompt.summary.split(/(?<=\.)\s/)[0]!);
	/** The ranking also lists unranked runs on older revisions, so it shows whenever there are any. */
	const showRanking = $derived(contenders.length > 0 || benchmark.outdatedRuns.length > 0);

	const gridKeys: FilterKey[] = ['model', 'plugin', 'harness'];
</script>

<Seo title="{prompt.title}: AI benchmark" description={prompt.summary} />

<!-- Results first: the hero is what the models actually drew, side by side, best first. How the
test works comes last, for whoever wants to check it. -->
<section
	class="relative isolate overflow-hidden border-b-6 border-pixel"
	aria-labelledby="benchmark-title"
>
	{#if winner}
		<!-- The winning piece, blurred, tints the whole stage in its own colours. Decorative. -->
		<img
			src={winner.run.cover.url}
			alt=""
			aria-hidden="true"
			decoding="async"
			class="absolute inset-0 -z-20 size-full scale-125 object-cover opacity-35 blur-3xl saturate-150"
		/>
	{/if}

	<div class="grid-dots absolute inset-0 -z-10 bg-background/60"></div>

	<div class="mx-auto max-w-6xl px-4 pt-6 pb-14 sm:px-6 sm:pb-20">
		<a
			href={resolve('benchmarks')}
			class="inline-flex h-10 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
			><ArrowLeftIcon aria-hidden="true" />All benchmarks</a
		>

		<p class="eyebrow mt-6">Benchmark</p>
		<h1
			id="benchmark-title"
			class="title-depth mt-5 max-w-[28ch] text-2xl leading-snug sm:text-4xl sm:leading-snug"
		>
			{prompt.title}
		</h1>

		<ul class="mt-5 flex flex-wrap gap-3 px-1.5" aria-label="Benchmark details">
			<li><Badge variant="outline" class="text-[0.625rem]">Revision {prompt.revision}</Badge></li>
			<li>
				<Badge variant="outline" class="text-[0.625rem]">
					{plural(prompt.criteria.length, 'criterion', 'criteria')}
				</Badge>
			</li>
			<li>
				<Badge variant="outline" class="text-[0.625rem]"
					>{plural(prompt.steps.length, 'step')}</Badge
				>
			</li>
		</ul>

		<p class="lead mt-5">
			{lede}
			{#if offStage > 0}
				{plural(contenders.length, 'model')} got the same prompt. These are the top three.
			{:else if contenders.length > 1}
				{plural(contenders.length, 'model')} got the same prompt. This is what each one drew.
			{:else if contenders.length === 1}
				This is the best run so far.
			{/if}
		</p>

		{#if winner}
			<div
				class={[
					'mt-12 grid gap-6 px-1.5 sm:gap-8',
					runnersUp.length > 0 ? 'lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]' : 'max-w-2xl'
				]}
			>
				<ContenderCard contender={winner} place={1} lead />
				{#if runnersUp.length > 0}
					<ol
						class="grid content-start gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-1"
						aria-label="Runners-up"
					>
						{#each runnersUp as contender, index (contender.modelLabel)}
							<li><ContenderCard {contender} place={index + 2} /></li>
						{/each}
					</ol>
				{/if}
			</div>
			{#if offStage > 0}
				<p class="mt-6 text-sm text-muted-foreground">
					{plural(offStage, 'more model')} in the full ranking below.
				</p>
			{/if}
		{:else}
			<p
				class="canvas-checker pixel-notch mt-10 border-6 border-dashed border-pixel p-8 text-center text-muted-foreground [--notch:6px]"
			>
				Nobody has drawn this one yet. The maintainers run the benchmarks; new models are added as
				they are tested.
			</p>
		{/if}

		<div class="mt-10 flex flex-wrap gap-6 px-1.5">
			{#if winner}
				<Button href="#ranking" variant="outline">
					<ArrowDownIcon aria-hidden="true" />
					Full ranking
				</Button>
			{/if}
			<Button href="#method" variant="outline">
				<ArrowDownIcon aria-hidden="true" />
				How it was tested
			</Button>
		</div>
	</div>
</section>

<div class="mx-auto max-w-6xl px-4 pt-16 sm:px-6 sm:pt-20">
	{#if showRanking}
		<BenchmarkMatrix {benchmark} />
	{/if}

	{#if benchmark.cells.length > 0}
		<RunProgress title={prompt.title} progress={benchmark.progress} {modelOrder} />
	{/if}

	{#if runs.length > 0}
		<section class={[showRanking && 'mt-20']} aria-labelledby="runs">
			<div class="flex flex-wrap items-center justify-between gap-4">
				<h2 id="runs" class="section-title text-lg sm:text-2xl">Every run</h2>
				{#if runs.length > 1}
					<Button
						variant="outline"
						href={resolve('/benchmarks/[prompt]/compare', { prompt: prompt.id })}
					>
						<SlidersIcon aria-hidden="true" />
						Compare runs
					</Button>
				{/if}
			</div>
			<p class="mt-4 text-sm text-muted-foreground">
				{plural(runs.length, 'run')} of this prompt, highest score first. Runs on an older revision are
				marked unranked and come last.
			</p>
			<div class="mt-8">
				<GalleryGrid
					generations={runs}
					{facets}
					keys={gridKeys}
					path={resolve('/benchmarks/[prompt]', { prompt: prompt.id })}
				/>
			</div>
		</section>
	{/if}

	<section
		id="method"
		class={['scroll-mt-24', runs.length > 0 && 'mt-20']}
		aria-labelledby="method-title"
	>
		<h2 id="method-title" class="section-title text-lg sm:text-2xl">How it was tested</h2>
		<p class="mt-4 max-w-[62ch] text-sm text-muted-foreground">
			Every model gets this prompt word for word, on the same canvas and palette, and draws it in a
			live Aseprite window. Each criterion is a yes-or-no check on the files it hands back.
		</p>
		<div class="mt-8 px-1.5">
			<PromptMethod {prompt} {chips}>
				{#snippet timeline()}
					<PromptTimeline {prompt} />
				{/snippet}
				{#snippet criteria()}
					<PromptCriteria {prompt} />
				{/snippet}
			</PromptMethod>
		</div>
	</section>
</div>
