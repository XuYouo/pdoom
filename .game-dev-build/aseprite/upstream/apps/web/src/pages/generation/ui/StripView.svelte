<script lang="ts">
	import { FullscreenIcon } from '#shared/ui/pixel/index.js';
	import { innerWidth } from 'svelte/reactivity/window';
	import type { FileView } from '#entities/generation/index.js';
	import { containPixels } from '#shared/lib/pixel-fit.js';
	import { Lightbox } from '#shared/ui/lightbox/index.js';

	interface Props {
		file: FileView;
		alt: string;
	}

	let { file, alt }: Props = $props();

	let zoomed = $state(false);

	const native = $derived(
		file.width && file.height
			? { width: file.width / file.pixel, height: file.height / file.pixel }
			: null
	);
	/** Target height: 260px on a desktop, 180px on a phone. */
	const target = $derived((innerWidth.current ?? 1024) < 640 ? 180 : 260);

	// A strip of frames is sized by HEIGHT and scrolls sideways: fitted to the column's width it
	// would be a sliver.
	const size = $derived(
		native ? { width: (native.width * target) / native.height, height: target } : null
	);
</script>

<div class="group/zoom relative">
	<div class="canvas-checker overflow-x-auto overflow-y-hidden">
		<img
			src={file.url}
			{alt}
			loading="lazy"
			decoding="async"
			class="pixelated block max-w-none"
			style:width={size ? `${size.width}px` : undefined}
			style:height={size ? `${size.height}px` : `${target}px`}
		/>
	</div>
	<button
		type="button"
		class="pixel-notch absolute top-3 right-3 grid size-10 place-items-center border-4 border-foreground/50 bg-background/55 opacity-0 backdrop-blur-md transition-opacity [--notch:4px] group-hover/zoom:opacity-100 focus-visible:opacity-100 focus-visible:outline-offset-[-4px] dark:border-ring/70 [@media(hover:none)]:opacity-100"
		aria-label="Open full screen: {alt}"
		onclick={() => (zoomed = true)}
	>
		<FullscreenIcon />
	</button>
</div>

<Lightbox bind:open={zoomed} label={alt}>
	{#snippet children(box)}
		{@const fitted = native ? containPixels(native, box) : null}
		<img
			src={file.url}
			{alt}
			class="pixelated block max-w-full"
			style:width={fitted ? `${fitted.width}px` : undefined}
			style:height={fitted ? `${fitted.height}px` : undefined}
		/>
	{/snippet}
	{#snippet caption()}{alt}{/snippet}
</Lightbox>
