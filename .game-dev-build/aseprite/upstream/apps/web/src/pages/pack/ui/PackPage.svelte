<script lang="ts">
	import { resolve } from '$app/paths';
	import ArrowLeftIcon from '~icons/pixelarticons/arrow-left';
	import ReloadIcon from '~icons/pixelarticons/reload';
	import TrophyIcon from '~icons/pixelarticons/trophy';
	import { SITE_URL } from '#shared/lib/site.js';
	import { formatDate, plural } from '#shared/lib/format.js';
	import { Seo } from '#shared/ui/seo/index.js';
	import { Masonry, WALL_COLUMNS } from '#shared/ui/masonry/index.js';
	import { Badge, Button } from '#shared/ui/8bit/index.js';
	import { GenerationCard } from '#entities/generation/index.js';
	import type { PackPageData } from '../model/types';
	import PackOpening from './PackOpening.svelte';

	interface Props {
		data: PackPageData;
	}

	let { data }: Props = $props();

	const pack = $derived(data.pack);
	const models = $derived([
		...new Set(pack.generations.map((generation) => generation.modelLabel))
	]);
	const dates = $derived(pack.generations.map((generation) => generation.date).sort());
	const first = $derived(dates[0]!);
	const last = $derived(dates.at(-1)!);
	const cover = $derived(pack.generations[0]!.cover);
	// Same rule as a piece's page: a social card needs an absolute URL and ~300px across.
	const cardImage = $derived(
		(cover.width ?? 0) >= 300
			? cover.url.startsWith('http')
				? cover.url
				: `${SITE_URL}${cover.url}`
			: undefined
	);

	/** Bumped by "open it again": the stage is keyed on it, and a fresh stage replays from sealed. */
	let opening = $state(0);
</script>

<Seo
	title="{pack.title}: a pack of {pack.generations.length}"
	description={pack.description ??
		`${plural(pack.generations.length, 'piece')} of pixel art by ${models.join(', ')}.`}
	image={cardImage}
	imageAlt={pack.title}
	jsonLd={{
		'@context': 'https://schema.org',
		'@type': 'CollectionPage',
		name: pack.title,
		...(pack.description ? { description: pack.description } : {}),
		url: `${SITE_URL}/packs/${pack.id}`,
		hasPart: pack.generations.map((generation) => ({
			'@type': 'VisualArtwork',
			name: generation.title,
			url: `${SITE_URL}/g/${generation.id}`
		}))
	}}
/>

<div class="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
	<a
		href={resolve('gallery')}
		class="inline-flex h-10 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
		><ArrowLeftIcon aria-hidden="true" />Gallery</a
	>

	<!-- Kept short: the opening below is the point of the page and should start above the fold. -->
	<!-- Above the stage's glow, which spreads up behind it. -->
	<header class="page-hero relative z-10 mx-auto mt-2 max-w-[72ch] text-center [--hero-x:50%]">
		<p class="eyebrow mx-auto">Booster pack</p>
		<h1 class="title-depth mt-5 text-lg leading-snug text-balance sm:text-2xl sm:leading-snug">
			{pack.title}
		</h1>
		{#if pack.description}
			<p class="lead mx-auto mt-4">{pack.description}</p>
		{/if}
		<ul class="mt-6 flex flex-wrap justify-center gap-3" aria-label="About this pack">
			<li>
				<Badge class="text-[0.625rem] tabular-nums">{plural(pack.generations.length, 'card')}</Badge
				>
			</li>
			<li>
				<Badge variant="secondary" class="text-[0.625rem] tabular-nums"
					>{plural(models.length, 'model')}</Badge
				>
			</li>
			<li>
				<Badge variant="outline" class="text-[0.625rem] tabular-nums">
					{first === last ? formatDate(first) : `${formatDate(first)} – ${formatDate(last)}`}
				</Badge>
			</li>
		</ul>
	</header>
</div>

<!-- Wider than the text column: a fan of cards needs the room. Keyed on the pack too, so
navigating from one pack to another plays the new one from sealed. -->
<div class="mx-auto mt-6 max-w-7xl px-2 sm:px-6">
	{#key `${pack.id}:${opening}`}
		<PackOpening {pack} modelFirst={data.benchmark !== null} />
	{/key}
	<div class="relative z-10 flex min-h-12 flex-wrap items-center justify-center gap-4">
		<!-- Nothing to replay with motion reduced: the pack is shown already open. -->
		<Button variant="ghost" size="sm" onclick={() => (opening += 1)} class="motion-reduce:hidden">
			<ReloadIcon aria-hidden="true" />
			Open it again
		</Button>
		{#if data.benchmark}
			<Button
				href={resolve('/benchmarks/[prompt]', { prompt: data.benchmark })}
				variant="outline"
				size="sm"
			>
				<TrophyIcon aria-hidden="true" />
				See how they rank
			</Button>
		{/if}
	</div>
</div>

<!-- Full width, the same wall as the gallery: every card at its own shape, with the full plate. -->
<section class="px-4 pt-20 sm:px-6 lg:px-10" aria-labelledby="cards">
	<h2 id="cards" class="section-title text-lg sm:text-2xl">Every card</h2>
	<p class="mt-3 text-muted-foreground">In the order the pack deals them.</p>
	<Masonry
		items={pack.generations}
		key={(generation) => generation.id}
		breakpoints={WALL_COLUMNS}
		class="mt-10 px-1.5"
	>
		{#snippet item(generation, index)}
			<GenerationCard {generation} eager={index < 4} />
		{/snippet}
	</Masonry>
</section>
