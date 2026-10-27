<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { PaletteCard } from '#entities/knowledge/index.js';
	import SearchIcon from '~icons/pixelarticons/search';
	import { CopyButton } from '#features/copyPrompt/index.js';
	import { Badge, Input, ToggleGroup } from '#shared/ui/8bit/index.js';
	import { Seo } from '#shared/ui/seo/index.js';
	import type { KnowledgePalettesPageData, PaletteRow } from '../model/types';

	interface Props {
		data: KnowledgePalettesPageData;
	}

	let { data }: Props = $props();

	const PAGE = 48;
	const SIZES = [
		{ label: 'Any size', min: 1, max: 256 },
		{ label: '2–4', min: 2, max: 4 },
		{ label: '5–8', min: 5, max: 8 },
		{ label: '9–16', min: 9, max: 16 },
		{ label: '17–32', min: 17, max: 32 },
		{ label: '33–64', min: 33, max: 64 },
		{ label: '65+', min: 65, max: 256 }
	];

	let query = $state('');
	// The toggle group holds the label; clicking the pressed one clears it, which means any size.
	let sizeLabel = $state(SIZES[0]!.label);
	const size = $derived(SIZES.find((option) => option.label === sizeLabel) ?? SIZES[0]!);
	let shown = $state(PAGE);
	/** The full list, once /knowledge/palettes/catalogue.json has answered. */
	let catalogue = $state<PaletteRow[] | null>(null);
	let failed = $state(false);

	onMount(() => {
		// A prerendered page has no query string at build time; the index links here with ?q=.
		query = new URLSearchParams(location.search).get('q') ?? '';
		fetch(resolve('/knowledge/palettes/catalogue.json'))
			.then((response) => (response.ok ? (response.json() as Promise<PaletteRow[]>) : null))
			.then((rows) => {
				if (rows) catalogue = rows;
				else failed = true;
			})
			.catch(() => (failed = true));
	});

	const rows = $derived(catalogue ?? data.first);

	const colours = (row: PaletteRow) => row.hex.match(/.{6}/g)!.map((hex) => `#${hex}`);
	const count = (row: PaletteRow) => row.hex.length / 6;

	const terms = $derived(query.toLowerCase().split(/\s+/).filter(Boolean));
	const matching = $derived(
		rows.filter((row) => {
			const n = count(row);
			if (n < size.min || n > size.max) return false;
			if (terms.length === 0) return true;
			const haystack = `${row.id} ${row.name} ${row.author} ${row.tags}`.toLowerCase();
			return terms.every((term) => haystack.includes(term));
		})
	);
	const visible = $derived(matching.slice(0, shown));

	// A new search starts from the top of the list again.
	$effect(() => {
		void terms;
		void size;
		shown = PAGE;
	});

	// Infinite scroll: the next page loads when a sentinel under the grid comes within a screen
	// of the viewport. The attachment reads `shown` and `matching`, so it re-attaches after each
	// page — and a fresh observer reports at once if the sentinel is still in range, which keeps
	// loading until the screen is full instead of waiting for another scroll.
	function loadMore(sentinel: HTMLElement) {
		if (shown >= matching.length) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) shown += PAGE;
			},
			{ rootMargin: '0px 0px 100% 0px' }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}
</script>

<Seo
	title="{data.total} pixel-art palettes"
	description="Every palette Aseprite AI Artist can load by name: the console classics and the {data.fromLospec} most-downloaded palettes on Lospec, searchable by name, author, tag and size."
/>

<header class="page-hero px-4 pt-12 sm:px-6 sm:pt-16 lg:px-10">
	<nav aria-label="Breadcrumb" class="text-sm text-muted-foreground">
		<a href={resolve('/knowledge')} class="underline-offset-4 hover:text-foreground hover:underline"
			>Knowledge base</a
		>
		<span aria-hidden="true"> / </span><span class="text-foreground">Palettes</span>
	</nav>
	<p class="eyebrow mt-6">{data.total} palettes</p>
	<h1 class="title-depth mt-5 text-2xl leading-snug sm:text-4xl sm:leading-snug">
		Every <span class="text-holo">palette</span>, by name
	</h1>
	<p class="lead mt-5">
		An agent loads any of these with <code class="text-foreground">palette</code> op
		<code class="text-foreground">preset</code> and its key — no file, no download. A name that is
		not a key works as a search, so asking for <code class="text-foreground">"endesga"</code> lists every
		Endesga palette.
	</p>
	<p class="mt-4 max-w-[62ch] text-muted-foreground">
		The console classics, then the most-downloaded palettes on
		<a
			href="https://lospec.com/palette-list"
			rel="noopener"
			class="text-foreground underline underline-offset-4">Lospec</a
		>, each credited to its author.
	</p>
</header>

<div class="px-4 pb-24 sm:px-6 lg:px-10">
	<search
		class="pixel-frame mt-10 block bg-card/80 p-5 backdrop-blur-sm sm:p-6"
		aria-label="Palettes"
	>
		<label for="palette-search" class="flex items-center gap-2 text-sm text-muted-foreground">
			<SearchIcon aria-hidden="true" />
			Search by name, author or tag
		</label>
		<div class="mt-3 max-w-xl px-1.5">
			<Input
				id="palette-search"
				type="search"
				font="normal"
				placeholder="endesga, gameboy, sunset, 1bit…"
				autocomplete="off"
				spellcheck="false"
				class="h-12 text-base"
				bind:value={query}
			/>
		</div>
		<div class="mt-6 border-t-4 border-dashed border-border pt-5">
			<p id="palette-size" class="text-sm text-muted-foreground">Colours</p>
			<ToggleGroup.Root bind:value={sizeLabel} aria-labelledby="palette-size" class="mt-3">
				{#each SIZES as option (option.label)}
					<ToggleGroup.Item value={option.label}>{option.label}</ToggleGroup.Item>
				{/each}
			</ToggleGroup.Root>
		</div>
		<p class="mt-4 text-sm text-muted-foreground tabular-nums" aria-live="polite">
			{#if failed}
				The full list did not load; showing the first {data.first.length} of {data.total}. Reload to
				try again.
			{:else if !catalogue}
				{data.total} palettes{terms.length || size !== SIZES[0] ? ' — loading the full list…' : ''}
			{:else}
				{matching.length === catalogue.length
					? `${matching.length} palettes`
					: `${matching.length} of ${catalogue.length} palettes`}
			{/if}
		</p>
	</search>

	{#if visible.length}
		<ul
			class="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
		>
			{#each visible as row (row.id)}
				<li>
					<PaletteCard
						id={row.id}
						name={row.name}
						author={row.author}
						colors={colours(row)}
						notes={row.notes}
						source={row.source}
						heading="h2"
					>
						{#snippet actions()}
							<CopyButton
								text={row.id}
								label="Copy key {row.id}"
								done="Copied {row.id}"
								variant="ghost"
								iconOnly
								class="size-10 px-0"
							/>
						{/snippet}
					</PaletteCard>
				</li>
			{/each}
		</ul>
		{#if matching.length > visible.length}
			<!-- Reaching this loads the next page; the line under it says how far the list goes. -->
			<div {@attach loadMore} class="h-px" aria-hidden="true"></div>
		{/if}
		<p class="mt-8 text-center text-sm text-muted-foreground">
			{#if matching.length > visible.length}
				Showing {visible.length} of {matching.length} — scroll for more
			{:else if visible.length > PAGE}
				All {matching.length} shown
			{/if}
		</p>
	{:else}
		<div class="mt-10 border-4 border-dashed border-border bg-card/60 p-8 text-center">
			<p class="retro text-xs">No palette matches</p>
			<p class="mt-3 text-muted-foreground">
				Try one word of the name or the author, or
				<button
					type="button"
					class="text-foreground underline underline-offset-4"
					onclick={() => {
						query = '';
						sizeLabel = SIZES[0]!.label;
					}}>clear the filters</button
				>.
			</p>
		</div>
	{/if}
</div>
