<script lang="ts">
	import { Seo } from '#shared/ui/seo/index.js';
	import { resolve } from '$app/paths';
	import PaletteIcon from '~icons/pixelarticons/colors-swatch';
	import { GalleryGrid } from '#features/filterGenerations/index.js';
	import {
		Button,
		Empty,
		EmptyContent,
		EmptyDescription,
		EmptyHeader,
		EmptyMedia,
		EmptyTitle,
		Kbd
	} from '#shared/ui/8bit/index.js';
	import type { GalleryPageData } from '../model/types';

	interface Props {
		data: GalleryPageData;
	}

	let { data }: Props = $props();

	const { generations, packs, facets } = $derived(data);
</script>

<Seo
	title="Gallery of AI-drawn pixel art"
	description="Every piece of pixel art made with Aseprite AI Artist, filterable by model, plugin version and harness."
/>

<!-- Full width, like a pin board: the wall of art is the page, and a wide screen gets more columns
rather than wider margins. -->
<div class="px-4 pt-12 sm:px-6 sm:pt-16 lg:px-10">
	<header class="page-hero">
		<div class="flex flex-wrap items-end justify-between gap-x-8 gap-y-6">
			<div>
				<p class="eyebrow">Gallery</p>
				<h1 class="title-depth mt-5 text-2xl leading-snug sm:text-4xl sm:leading-snug">Gallery</h1>
			</div>
			<!-- Outline, not accent: the wall below is the page, and this is the way in for contributors. -->
			<Button href={resolve('contribute')} variant="outline">Add your art</Button>
		</div>
		<p class="lead mt-5">
			Every piece submitted so far, newest first. Runs that belong together, like one benchmark's,
			come sealed in a pack. Open a piece to see the prompts that made it and download the source.
		</p>
	</header>

	{#if generations.length === 0 && packs.length === 0}
		<Empty
			class="canvas-checker pixel-notch mt-10 border-6 border-dashed border-pixel [--notch:6px]"
		>
			<EmptyHeader>
				<EmptyMedia variant="icon"><PaletteIcon aria-hidden="true" /></EmptyMedia>
				<EmptyTitle class="text-sm leading-relaxed">Nothing hanging yet</EmptyTitle>
				<EmptyDescription class="font-sans text-base">
					The gallery fills up through pull requests. Draw something with the plugin and run
					<Kbd class="h-6 px-1.5">/aseprite:submit</Kbd>: it packages the files and prompts for you.
				</EmptyDescription>
			</EmptyHeader>

			<EmptyContent
				><Button href={resolve('contribute')} variant="accent">Add the first piece</Button
				></EmptyContent
			>
		</Empty>
	{:else}
		<div class="mt-10">
			<GalleryGrid {generations} {packs} {facets} path={resolve('gallery')} />
		</div>
	{/if}
</div>
