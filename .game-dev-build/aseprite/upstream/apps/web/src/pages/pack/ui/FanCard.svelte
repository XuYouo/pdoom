<!--
	One card in the opened pack's fan: a fixed trading-card shape (63:88), so the fan reads as a
	hand of cards whatever each piece's own aspect is. Under a mouse it tilts toward the pointer
	and a holo sheen follows it, the way a foil card catches light. Everything inside is sized in
	em off `--card-w`, so the card is the same card at every width.

	Out of the tab order: the fan duplicates the list under it, which is the keyboard and
	screen-reader way in.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatDate } from '#shared/lib/format.js';
	import { HoloShine, pointerShine } from '#shared/ui/holo/index.js';
	import type { GenerationSummary } from '#entities/generation/index.js';

	interface Props {
		generation: GenerationSummary;
		/**
		 * The pack's cards are runs of one task and share its title (give or take a word), so the
		 * model takes the name plate and the date drops to the text plate.
		 */
		modelFirst?: boolean;
	}

	let { generation, modelFirst = false }: Props = $props();

	const native = $derived(
		generation.cover.width && generation.cover.height
			? {
					width: generation.cover.width / generation.cover.pixel,
					height: generation.cover.height / generation.cover.pixel
				}
			: null
	);
</script>

<a
	href={resolve('/g/[id]', { id: generation.id })}
	tabindex={-1}
	class="fan-card block"
	data-sound="card"
	{@attach pointerShine}
>
	<article
		class="face pixel-frame relative isolate flex aspect-[63/88] w-full flex-col gap-[0.4em] overflow-hidden bg-card p-[0.4em] [--frame:4px]"
	>
		<img
			src={generation.cover.url}
			alt=""
			decoding="async"
			class="absolute inset-0 -z-10 size-full scale-150 object-cover opacity-55 blur-2xl saturate-150"
		/>
		<div class="absolute inset-0 -z-10 bg-background/40"></div>

		<header
			class="plate flex min-h-[2.6em] items-center gap-[0.5em] py-[0.25em] pr-[0.6em] pl-[0.3em]"
		>
			{#if generation.points !== null}
				<!-- Floored at Press Start's native 8px: the score is what the small fan keeps. -->
				<span
					class="gem grid h-[max(2em,20px)] min-w-[max(2em,20px)] shrink-0 place-items-center px-[0.3em] retro text-[max(0.62em,8px)] tabular-nums"
					>{generation.points}</span
				>
			{/if}
			<h3 class="label line-clamp-2 min-w-0 retro text-[0.6em] leading-relaxed">
				{modelFirst ? generation.modelLabel : generation.title}
			</h3>
		</header>

		<div
			class="pixel-frame canvas-checker relative grid min-h-0 flex-1 place-items-center shadow-[inset_0_0.3em_0.6em_rgb(0_0_0/0.28)] [--frame:4px]"
		>
			<img
				src={generation.cover.url}
				alt={generation.title}
				width={native?.width}
				height={native?.height}
				decoding="async"
				class="pixelated block size-full object-contain"
			/>
		</div>

		<footer class="label plate px-[0.6em] py-[0.4em]">
			<p class="truncate text-[0.85em] font-medium">
				{modelFirst ? formatDate(generation.date) : generation.modelLabel}
			</p>
			<p class="truncate text-[0.72em] text-muted-foreground tabular-nums">
				v{generation.plugin} · {generation.harness}
			</p>
		</footer>

		<HoloShine />
	</article>
</a>

<style>
	.fan-card {
		container-type: inline-size;
		font-size: calc(var(--card-w) * 0.062);
	}
	/* Below this a card's lettering would be a few pixels tall: the small fan shows the art and
	   the score, and the list under it carries the words. */
	@container (max-width: 196px) {
		.label,
		header:not(:has(.gem)) {
			display: none;
		}
	}
	.face {
		box-shadow: 0 0.6em 1.4em rgb(0 0 0 / 0.35);
		transition: transform 160ms ease-out;
	}

	/* Tilts toward the pointer while it is over the card, like a foil card turned in the hand. */
	@media (hover: hover) and (prefers-reduced-motion: no-preference) {
		.fan-card:hover .face {
			transform: perspective(60em) rotateY(calc((var(--mx, 0.5) - 0.5) * 20deg))
				rotateX(calc((0.5 - var(--my, 0.5)) * 16deg));
			transition: transform 60ms linear;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.face {
			transition: none;
		}
	}
</style>
