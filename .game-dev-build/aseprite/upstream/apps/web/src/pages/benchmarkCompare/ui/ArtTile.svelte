<script lang="ts">
	import { FullscreenIcon } from '#shared/ui/pixel/index.js';
	import type { FileView } from '#entities/generation/index.js';
	import { containPixels } from '#shared/lib/pixel-fit.js';
	import { Lightbox } from '#shared/ui/lightbox/index.js';
	import type { Playback } from '../model/playback.svelte';
	import ArtLayer from './ArtLayer.svelte';

	interface Props {
		file: FileView;
		alt: string;
		playback: Playback;
	}

	let { file, alt, playback }: Props = $props();

	let available = $state<number | null>(null);
	let zoomed = $state(false);

	// Fills the tile's width; the height follows, capped at 1.5× the width for very tall art.
	const size = $derived.by(() => {
		if (!file.width || !file.height || !available) return null;
		const art = { width: file.width / file.pixel, height: file.height / file.pixel };
		return containPixels(art, { width: available, height: available * 1.5 });
	});
</script>

<div
	class="group/zoom relative flex w-full min-w-0 justify-center overflow-x-auto"
	bind:clientWidth={available}
>
	{#if size}
		<ArtLayer
			{file}
			{alt}
			width={size.width}
			height={size.height}
			{playback}
			class="block shrink-0"
		/>
	{:else if file.extension === 'gif'}
		<!-- Until the width is measured: a bare <img> would play the GIF on the browser's clock, then be swapped for the canvas. -->
		<div class="aspect-square w-full animate-pulse bg-muted/40"></div>
	{:else}
		<img src={file.url} {alt} class="pixelated block w-full" />
	{/if}
	<button
		type="button"
		class="pixel-notch absolute top-0 right-0 grid size-11 place-items-center border-4 border-foreground/50 bg-background/55 opacity-0 backdrop-blur-md transition-opacity [--notch:4px] group-hover/zoom:opacity-100 focus-visible:opacity-100 focus-visible:outline-offset-[-4px] dark:border-ring/70 [@media(hover:none)]:opacity-100"
		aria-label="Open full screen: {alt}"
		onclick={() => (zoomed = true)}
	>
		<FullscreenIcon />
	</button>
</div>

<Lightbox bind:open={zoomed} label={alt}>
	{#snippet children(box)}
		{#if file.width && file.height}
			{@const fitted = containPixels(
				{ width: file.width / file.pixel, height: file.height / file.pixel },
				box
			)}
			<!-- The same shared clock as the grid, so the enlarged animation stays in step with it. -->
			<ArtLayer {file} {alt} width={fitted.width} height={fitted.height} {playback} class="block" />
		{:else}
			<img src={file.url} {alt} class="pixelated block max-h-full max-w-full" />
		{/if}
	{/snippet}
	{#snippet caption()}{alt}{/snippet}
</Lightbox>
