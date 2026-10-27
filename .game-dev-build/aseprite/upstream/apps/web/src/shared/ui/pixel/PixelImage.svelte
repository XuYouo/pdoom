<script lang="ts">
	import FullscreenIcon from './FullscreenIcon.svelte';
	import { cn } from '#shared/lib/utils.js';
	import { containPixels } from '#shared/lib/pixel-fit.js';
	import { Lightbox } from '#shared/ui/lightbox/index.js';

	interface Props {
		src: string;
		/** Intrinsic size of the image file; null when it could not be read. */
		width: number | null;
		height: number | null;
		/** Screen pixels per art pixel already baked into the file (an 8× export is 8). */
		pixel?: number;
		alt: string;
		/** The art never gets shorter than this; a very wide image gets space above and below. */
		minHeight?: number;
		eager?: boolean;
		/** A click opens the art full screen, as large as the screen allows. */
		zoomable?: boolean;
		class?: string;
	}

	let {
		src,
		width,
		height,
		pixel = 1,
		alt,
		minHeight = 0,
		eager = false,
		zoomable = false,
		class: className
	}: Props = $props();

	let zoomed = $state(false);

	const native = $derived(
		width && height ? { width: width / pixel, height: height / pixel } : null
	);
</script>

<!-- The art fills the width it is given, edge to edge, and its height follows. The scale is
whatever fills the width rather than a whole multiple: no empty margins was the point. Art
taller than 1.5× its width is capped and centred. -->
{#snippet image()}
	<img
		{src}
		{alt}
		width={native?.width}
		height={native?.height}
		loading={eager ? 'eager' : 'lazy'}
		decoding="async"
		class="pixelated block h-auto max-h-[150cqw] w-full object-contain"
	/>
{/snippet}

<div
	class={cn('@container grid w-full min-w-0 place-items-center', className)}
	style:min-height={minHeight ? `${minHeight}px` : undefined}
>
	{#if zoomable}
		<button
			type="button"
			class="group/zoom relative block w-full cursor-zoom-in"
			aria-label="Open full screen: {alt}"
			onclick={() => (zoomed = true)}
		>
			{@render image()}
			<span
				class="plate pointer-events-none absolute top-3 right-3 grid size-10 place-items-center opacity-0 transition-opacity group-hover/zoom:opacity-100 group-focus-visible/zoom:opacity-100 [@media(hover:none)]:opacity-100"
				aria-hidden="true"
			>
				<FullscreenIcon />
			</span>
		</button>
	{:else}
		{@render image()}
	{/if}
</div>

{#if zoomable}
	<Lightbox bind:open={zoomed} label={alt}>
		{#snippet children(box)}
			{@const fitted = native ? containPixels(native, box) : null}
			<img
				{src}
				{alt}
				class="pixelated block max-w-none"
				style:width={fitted ? `${fitted.width}px` : 'auto'}
				style:height={fitted ? `${fitted.height}px` : 'auto'}
				style:max-width={fitted ? undefined : '100%'}
				style:max-height={fitted ? undefined : '100%'}
			/>
		{/snippet}
		{#snippet caption()}{alt}{/snippet}
	</Lightbox>
{/if}
