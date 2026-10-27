<script lang="ts">
	import { PLUGIN_NAME, REPO_URL, SITE_NAME, SITE_URL, STUDIO_URL } from '#shared/lib/site.js';
	import { Seo } from '#shared/ui/seo/index.js';
	import { resolve } from '$app/paths';
	import PaletteIcon from '~icons/pixelarticons/colors-swatch';
	import { ScoreMeter } from '#entities/generation/index.js';
	import { WallTileCard, wallTileKey } from '#entities/pack/index.js';
	import { Masonry, WALL_COLUMNS } from '#shared/ui/masonry/index.js';
	import { PixelAnimation } from '#shared/ui/pixel/index.js';
	import {
		Button,
		Card,
		CardContent,
		CardDescription,
		CardFooter,
		CardHeader,
		CardTitle,
		Empty,
		EmptyContent,
		EmptyDescription,
		EmptyHeader,
		EmptyMedia,
		EmptyTitle,
		Kbd
	} from '#shared/ui/8bit/index.js';
	import { plural } from '#shared/lib/format.js';
	import { PEBBLY_DURATIONS, PEBBLY_FRAMES } from '#shared/config/index.js';
	import type { HomePageData } from '../model/types';

	interface Props {
		data: HomePageData;
	}

	let { data }: Props = $props();

	const { counts, newest, latest, teasers } = $derived(data);
	const word = (count: number, one: string, many = `${one}s`) => (count === 1 ? one : many);
	const stats = $derived([
		{ value: counts.generations, label: word(counts.generations, 'piece') },
		{ value: counts.models, label: word(counts.models, 'model') },
		{ value: counts.prompts, label: word(counts.prompts, 'benchmark') }
	]);
</script>

<Seo
	title="{SITE_NAME}: pixel art drawn by AI agents in Aseprite"
	description="A gallery of pixel art made by AI agents in a live Aseprite window, with the exact prompts, models and files, and a benchmark that scores models on the same fixed tasks."
	jsonLd={[
		{
			'@context': 'https://schema.org',
			'@type': 'WebSite',
			name: SITE_NAME,
			url: SITE_URL,
			description: `Pixel art drawn by AI agents through ${PLUGIN_NAME}, and a benchmark of the models that draw it.`,
			publisher: { '@type': 'Organization', name: 'pebbly', url: STUDIO_URL }
		},
		{
			'@context': 'https://schema.org',
			'@type': 'Organization',
			name: 'pebbly',
			url: STUDIO_URL,
			logo: `${SITE_URL}/web-app-manifest-512x512.png`,
			sameAs: [REPO_URL]
		}
	]}
/>

<section class="page-hero">
	<div
		class="mx-auto grid max-w-7xl items-center gap-14 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:gap-16 lg:py-24"
	>
		<div>
			<p class="eyebrow">Gallery &amp; benchmark</p>
			<h1
				class="title-depth mt-7 text-[1.625rem] leading-snug sm:text-4xl sm:leading-[1.25] xl:text-[2.75rem]"
			>
				Pixel art, drawn by <span class="text-holo">agents</span> in a real Aseprite window.
			</h1>
			<p class="lead mt-7 sm:text-xl">
				Everything here was made with <a
					href="https://github.com/with-pebbly/aseprite-ai-artist"
					class="text-foreground underline decoration-accent underline-offset-4"
					rel="noopener">Aseprite AI Artist</a
				>, the plugin that lets Claude, GPT and friends hold the brush. Each piece comes with the
				exact prompts, the model that answered each one, and the
				<code class="text-foreground">.aseprite</code> file to open yourself. The benchmark puts every
				model through the same fixed tasks and scores them criterion by criterion.
			</p>

			<div class="mt-10 flex flex-wrap items-center gap-6 px-1.5">
				<Button href={resolve('gallery')} variant="accent" size="lg">Browse the gallery</Button>
				<Button href={resolve('benchmarks')} variant="outline" size="lg">See the benchmark</Button>
			</div>

			<!-- The counts as a scoreboard: big numbers, the label under each. -->
			<dl class="mt-12 grid max-w-md grid-cols-3 gap-4 border-t-4 border-dashed border-pixel pt-6">
				{#each stats as stat (stat.label)}
					<div class="flex flex-col-reverse gap-2">
						<dt class="text-sm text-muted-foreground">{stat.label}</dt>
						<dd class="retro text-xl text-foreground tabular-nums sm:text-2xl">{stat.value}</dd>
					</div>
				{/each}
			</dl>
		</div>

		<figure class="w-full justify-self-center lg:max-w-[26rem] lg:justify-self-end">
			<Card font="normal" class="gap-0 py-0">
				<div class="flex items-center gap-2 border-b-4 border-pixel px-4 py-2.5">
					<span class="size-2.5 bg-pico-red" aria-hidden="true"></span>
					<span class="size-2.5 bg-pico-yellow" aria-hidden="true"></span>
					<span class="size-2.5 bg-pico-green" aria-hidden="true"></span>
					<span class="ml-2 truncate retro text-[0.625rem] text-muted-foreground">
						pebbly.aseprite
					</span>
				</div>
				<div class="canvas-checker grid aspect-square place-items-center overflow-hidden p-6">
					<PixelAnimation
						frames={PEBBLY_FRAMES}
						durations={PEBBLY_DURATIONS}
						scale={7}
						label="Pebbly, a pebble with a paintbrush sprouting from its head"
					/>
				</div>
			</Card>
			<figcaption class="mt-5 text-center text-sm text-muted-foreground lg:text-right">
				Pebbly, drawn with the plugin itself.
				{#if newest}
					Newest piece: <a
						href={resolve('/g/[id]', { id: newest.id })}
						class="text-foreground underline underline-offset-4">{newest.title}</a
					>, by {newest.modelLabel}.
				{/if}
			</figcaption>
		</figure>
	</div>
</section>

<!-- Full width, the same wall as the gallery page: this is a preview of it. -->
<section class="px-4 pt-16 sm:px-6 lg:px-10" aria-labelledby="newest">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<h2 id="newest" class="section-title text-lg sm:text-2xl">Newest pieces</h2>
		{#if counts.generations > latest.length}
			<a
				href={resolve('gallery')}
				class="text-sm font-medium underline decoration-accent underline-offset-4 hover:text-accent-ink"
				>All {counts.generations} pieces →</a
			>
		{/if}
	</div>
	{#if latest.length > 0}
		<Masonry items={latest} key={wallTileKey} breakpoints={WALL_COLUMNS} class="mt-10 px-1.5">
			{#snippet item(tile, index)}
				<WallTileCard {tile} eager={index < 4} />
			{/snippet}
		</Masonry>
	{:else}
		<Empty
			class="canvas-checker pixel-notch mt-10 border-6 border-dashed border-pixel [--notch:6px]"
		>
			<EmptyHeader>
				<EmptyMedia variant="icon"><PaletteIcon aria-hidden="true" /></EmptyMedia>
				<EmptyTitle class="text-sm leading-relaxed">The walls are bare</EmptyTitle>
				<EmptyDescription class="font-sans text-base">
					Nobody has submitted a piece yet. Draw something with the plugin, then run
					<Kbd class="h-6 px-1.5">/aseprite:submit</Kbd> to open a pull request with the files and prompts.
				</EmptyDescription>
			</EmptyHeader>

			<EmptyContent><Button href={resolve('contribute')}>Add the first piece</Button></EmptyContent>
		</Empty>
	{/if}
</section>

{#if teasers.length > 0}
	<section class="mx-auto max-w-6xl px-4 pt-24 sm:px-6" aria-labelledby="bench">
		<h2 id="bench" class="section-title text-lg sm:text-2xl">The benchmark</h2>
		<p class="lead mt-4 text-base">
			Same prompt, same canvas, same palette, judged against the same written criteria. Scores are
			kept per plugin version, so you can see whether a model got better or the tool did.
		</p>
		<div class="mt-10 grid grid-cols-[minmax(0,1fr)] gap-10 px-1.5 md:grid-cols-2">
			{#each teasers as teaser (teaser.id)}
				<Card font="normal" class="h-full">
					<CardHeader>
						<CardTitle class="text-base leading-relaxed">
							<a
								href={resolve('/benchmarks/[prompt]', { prompt: teaser.id })}
								class="hover:underline">{teaser.title}</a
							>
						</CardTitle>
						<CardDescription font="normal" class="font-sans text-sm">
							Revision {teaser.revision}, {plural(teaser.criteria, 'criterion', 'criteria')}, {plural(
								teaser.runs,
								'ranked run'
							)}
						</CardDescription>
					</CardHeader>
					<CardContent font="normal" class="space-y-5">
						<p class="max-w-[60ch]">{teaser.summary}</p>
						{#if teaser.top.length > 0}
							<ol class="space-y-3">
								{#each teaser.top as leader, rank (leader.modelLabel)}
									<li class="flex items-center gap-3">
										<span class="w-6 retro text-xs text-muted-foreground tabular-nums"
											>{rank + 1}</span
										>
										<a
											href={resolve('/g/[id]', { id: leader.run })}
											class="min-w-0 flex-1 truncate font-medium hover:underline"
										>
											{leader.modelLabel}
										</a>
										<span class="hidden text-sm text-muted-foreground sm:inline"
											>v{leader.plugin}</span
										>
										<ScoreMeter points={leader.points} />
									</li>
								{/each}
							</ol>
						{/if}
					</CardContent>
					<CardFooter class="pt-2">
						<Button
							href={resolve('/benchmarks/[prompt]', { prompt: teaser.id })}
							variant="outline"
							size="sm"
						>
							Full results
						</Button>
					</CardFooter>
				</Card>
			{/each}
		</div>
	</section>
{/if}
