<!--
	A sealed booster pack, built on the same skeleton as a piece's card (name plate, art window,
	text plate, at the same insets) so it sits in a wall of cards without shifting its rhythm. What
	makes it a pack is around that skeleton: crimped heat-seal strips top and bottom, foil rails at
	the sides, and a holo highlight that follows the pointer. The colour comes from the first
	card's own art, blurred behind the foil, so two packs never look alike. Presentational only:
	the wall tile and the pack page both wrap it. `data-part="top"` marks the strip the pack page
	tears off.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#shared/lib/utils.js';
	import { HoloShine, pointerShine } from '#shared/ui/holo/index.js';
	import type { FileView } from '#entities/generation/@x/pack.js';

	interface Props {
		title: string;
		count: number;
		cover: FileView;
		/** Element the title renders as: a heading on the wall, plain text where a page names it. */
		heading?: 'h2' | 'h3' | 'p';
		eager?: boolean;
		/** The text plate under the art: what is inside. Without it the pack ends at the art. */
		caption?: Snippet;
		/** Shared by the wall tile and the pack page, so the pack flies from one to the other. */
		transitionName?: string;
		class?: string;
	}

	let {
		title,
		count,
		cover,
		heading = 'h3',
		eager = false,
		caption,
		transitionName,
		class: className
	}: Props = $props();

	const native = $derived(
		cover.width && cover.height
			? { width: cover.width / cover.pixel, height: cover.height / cover.pixel }
			: null
	);
</script>

<div
	class={cn('booster flex flex-col', className)}
	style:view-transition-name={transitionName}
	{@attach pointerShine}
>
	<div class="crimp crimp-top" data-part="top"></div>

	<!-- Insets add up to a card's: 10px seal + 4px here on top, 4px rail + 10px at the sides,
	which is a card's 6px frame + 8px padding, so the name plates line up across a row. -->
	<div
		class="foil-body relative isolate flex flex-1 flex-col gap-2 overflow-hidden px-2.5 pt-1 pb-1"
	>
		<img
			src={cover.url}
			alt=""
			aria-hidden="true"
			loading={eager ? 'eager' : 'lazy'}
			decoding="async"
			class="absolute inset-0 -z-20 size-full scale-150 object-cover opacity-60 blur-3xl saturate-150"
		/>
		<div class="absolute inset-0 -z-10 bg-background/40"></div>

		<div class="plate flex min-h-11 items-center gap-2.5 py-1.5 pr-3 pl-1.5">
			<span
				class="gem grid h-8 min-w-8 shrink-0 place-items-center px-1.5 retro text-[0.625rem] tabular-nums"
				aria-hidden="true">{count}</span
			>
			<svelte:element this={heading} class="title min-w-0 retro text-[0.6875rem] leading-relaxed">
				{title}
			</svelte:element>
		</div>

		<!-- The same art window as a card's: the art fills the width and sets the height. -->
		<div
			class="window pixel-frame canvas-checker @container relative grid place-items-center [--frame:4px]"
		>
			<img
				src={cover.url}
				alt=""
				width={native?.width}
				height={native?.height}
				loading={eager ? 'eager' : 'lazy'}
				decoding="async"
				class="pixelated block h-auto max-h-[150cqw] w-full object-contain"
			/>
		</div>

		{#if caption}
			<div class="plate flex-1 space-y-1.5 px-3 py-2.5">{@render caption()}</div>
		{/if}

		<!-- Softer than a fan card's: the pack is bigger, and at full strength the dodge washes
		out the whole art window instead of catching a corner of it. -->
		<HoloShine strength={0.28} />
	</div>

	<div class="crimp crimp-bottom"></div>
</div>

<style>
	.booster {
		--seal: 10px;
		--teeth: 4px;
		container-type: inline-size;
		/* Picks the pack's own flight timing out of the page transition (app/styles). */
		view-transition-class: pack;
	}
	/* A card's art window never gets shorter than 240px; a narrow pack (the pack page on a
	   phone) scales that down so it keeps a pack's proportions. */
	.window {
		min-height: min(240px, 80cqw);
	}
	/* A narrow pack sets its title at Press Start's native 8px, cut at three lines, so it does
	   not break into slivers. */
	@container (max-width: 220px) {
		.title {
			font-size: 0.5rem;
			display: -webkit-box;
			-webkit-box-orient: vertical;
			-webkit-line-clamp: 3;
			line-clamp: 3;
			overflow: hidden;
		}
	}

	/* The heat seal: ridged metal foil, with a square-toothed outer edge. Square teeth rather
	   than a zigzag, because a diagonal would anti-alias and every other edge here steps. */
	.crimp {
		height: var(--seal);
		background:
			repeating-linear-gradient(90deg, rgb(0 0 0 / 0.22) 0 2px, transparent 2px 6px),
			linear-gradient(
				180deg,
				color-mix(in oklab, var(--foreground) 34%, var(--card)),
				color-mix(in oklab, var(--foreground) 14%, var(--card))
			);
		box-shadow:
			inset 4px 0 0 var(--pixel-frame-color),
			inset -4px 0 0 var(--pixel-frame-color);
	}
	.crimp-top {
		mask:
			linear-gradient(#000 0 0) 0 var(--teeth) / 100% 100% no-repeat,
			repeating-linear-gradient(90deg, #000 0 6px, transparent 6px 12px) 0 0 / 100% var(--teeth)
				no-repeat;
	}
	.crimp-bottom {
		mask:
			linear-gradient(#000 0 0) 0 calc(var(--teeth) * -1) / 100% 100% no-repeat,
			repeating-linear-gradient(90deg, #000 0 6px, transparent 6px 12px) 0 100% / 100% var(--teeth)
				no-repeat;
	}

	/* Foil: the card's glow under a fine pixel dither, between 4px rails in the frame colour. */
	.foil-body {
		background:
			repeating-conic-gradient(rgb(255 255 255 / 0.06) 0 25%, transparent 0 50%) 0 0 / 4px 4px,
			var(--card);
		box-shadow:
			inset 4px 0 0 var(--pixel-frame-color),
			inset -4px 0 0 var(--pixel-frame-color);
	}
</style>
