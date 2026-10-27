<script lang="ts">
	import type { Snippet } from 'svelte';
	import FullscreenIcon from './FullscreenIcon.svelte';
	import { cn } from '#shared/lib/utils.js';
	import { containPixels } from '#shared/lib/pixel-fit.js';
	import { Lightbox } from '#shared/ui/lightbox/index.js';

	interface Art {
		src: string;
		/** Intrinsic size of the file; null when it could not be read. */
		width: number | null;
		height: number | null;
		/** Screen pixels per art pixel already baked into the file (an 8× export is 8). */
		pixel: number;
	}

	interface Props {
		href: string;
		/** The art; null shows `empty` in its place. */
		art: Art | null;
		alt: string;
		/** On the name plate across the top of the card. */
		title: string;
		/** A gem on the name plate's left, like a card's cost: a score, a count. */
		badge?: Snippet;
		/** The text plate under the art: who made it, with what, how it scored. */
		caption: Snippet;
		empty?: Snippet;
		eager?: boolean;
		/** Shared with the page the card opens, so the art moves there instead of fading. */
		transitionName?: string;
		class?: string;
	}

	let {
		href,
		art,
		alt,
		title,
		badge,
		caption,
		empty,
		eager = false,
		transitionName,
		class: className
	}: Props = $props();

	/** The art window never gets shorter than this, so a wide landscape is not a thin strip. */
	const MIN_HEIGHT = 240;

	let zoomed = $state(false);
	// The name plate wraps to as many lines as the title needs, so the button that sits on the
	// art window's corner is placed from its measured height, not a fixed offset.
	let plateHeight = $state(44);

	const native = $derived(
		art?.width && art.height
			? { width: art.width / art.pixel, height: art.height / art.pixel }
			: null
	);
</script>

<!-- The link and the full-screen button are siblings, not nested: a button inside a link is not
valid HTML and neither would get a reliable click. -->
<div
	class={cn(
		'group relative transition-[translate] duration-150 focus-within:-translate-y-1 hover:-translate-y-1 motion-reduce:focus-within:translate-y-0 motion-reduce:hover:translate-y-0',
		className
	)}
>
	<a {href} class="block h-full outline-offset-8">
		<article
			class="pixel-frame relative isolate flex h-full flex-col gap-2 overflow-hidden bg-card p-2 shadow-[inset_0_0_0_2px_rgb(255_255_255/0.1)]"
			style:view-transition-name={transitionName}
		>
			{#if art}
				<!-- The art, blurred, behind the whole card: the card's body glows with the piece's own
				colours instead of being one flat panel. Decorative. -->
				<img
					src={art.src}
					alt=""
					aria-hidden="true"
					loading={eager ? 'eager' : 'lazy'}
					decoding="async"
					class="absolute inset-0 -z-10 size-full scale-150 object-cover opacity-55 blur-3xl saturate-150 transition-opacity duration-300 group-hover:opacity-85"
				/>
			{/if}
			<div class="absolute inset-0 -z-10 bg-background/40"></div>

			<!-- Name plate. -->
			<header
				bind:clientHeight={plateHeight}
				class="plate flex min-h-11 items-center gap-2.5 py-1.5 pr-3 pl-1.5"
			>
				{#if badge}
					<span
						class="gem grid h-8 min-w-8 shrink-0 place-items-center px-1.5 retro text-[0.625rem] tabular-nums"
					>
						{@render badge()}
					</span>
				{/if}
				<h3
					class={[
						'min-w-0 retro text-[0.6875rem] leading-relaxed group-hover:underline',
						!badge && 'pl-1.5'
					]}
				>
					{title}
				</h3>
			</header>

			<!-- Art window: the art fills its width edge to edge and sets the height. Only art too wide
			to reach MIN_HEIGHT gets space above and below (the canvas checkerboard), and art taller
			than 1.5× the width is capped and centred, so one piece cannot take a whole column. The
			scale is whatever fills the width, not a whole multiple: filling the card was the point. -->
			<div
				class="pixel-frame canvas-checker @container relative grid place-items-center [--frame:4px]"
				style:min-height="{MIN_HEIGHT}px"
			>
				{#if art}
					<img
						src={art.src}
						{alt}
						width={native?.width}
						height={native?.height}
						loading={eager ? 'eager' : 'lazy'}
						decoding="async"
						class="pixelated block h-auto max-h-[150cqw] w-full object-contain"
					/>
				{:else}
					{@render empty?.()}
				{/if}
			</div>

			<!-- Text plate. -->
			<div class="plate flex-1 space-y-1.5 px-3 py-2.5">
				{@render caption()}
			</div>
		</article>
	</a>
	{#if art}
		<button
			type="button"
			style:top="{plateHeight + 24}px"
			class="plate absolute right-5 grid size-10 place-items-center opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-offset-[-4px] [@media(hover:none)]:opacity-100"
			aria-label="Open full screen: {alt}"
			onclick={() => (zoomed = true)}
		>
			<FullscreenIcon />
		</button>
		<Lightbox bind:open={zoomed} label={alt}>
			{#snippet children(box)}
				{@const fitted = native ? containPixels(native, box) : null}
				<img
					src={art.src}
					{alt}
					class="pixelated block max-w-full"
					style:width={fitted ? `${fitted.width}px` : undefined}
					style:height={fitted ? `${fitted.height}px` : undefined}
					style:max-width={fitted ? 'none' : undefined}
				/>
			{/snippet}
			{#snippet caption()}{alt}{/snippet}
		</Lightbox>
	{/if}
</div>
