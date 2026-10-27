<!--
	A pack on the gallery wall: the sealed booster, with the backs of two more cards behind it
	like a stack. Its top edge is a card's top edge, and pointing at it moves it the way a card
	moves (up 4px), so a row mixing packs and pieces stays a row. The stack only fans out a few
	degrees: a hint of what the pack's page does, not a show of its own.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatDate, plural } from '#shared/lib/format.js';
	import { markFlight } from '../model/flight';
	import type { PackSummary } from '../model/types';
	import BoosterPack from './BoosterPack.svelte';

	interface Props {
		pack: PackSummary;
		eager?: boolean;
	}

	let { pack, eager = false }: Props = $props();

	const models = $derived([
		...new Set(pack.generations.map((generation) => generation.modelLabel))
	]);
	const first = $derived(pack.generations[0]!);

	// A plain click navigates here, in this tab, so the pack is about to fly; a modified click
	// opens another tab, where nothing flies.
	function launch(event: MouseEvent) {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
			return;
		}
		markFlight(pack.id);
	}
</script>

<a
	href={resolve('/packs/[id]', { id: pack.id })}
	class="pack-tile group relative block outline-offset-8"
	aria-label="Open the pack {pack.title}: {plural(pack.generations.length, 'card')}"
	data-sound="pack-take"
	onclick={launch}
>
	<!-- Card backs, deepest first, so each sits under the one after it. -->
	<div class="back pixel-frame absolute inset-0 [--d:2] [--frame:4px]" aria-hidden="true"></div>
	<div class="back pixel-frame absolute inset-0 [--d:1] [--frame:4px]" aria-hidden="true"></div>

	<BoosterPack
		title={pack.title}
		count={pack.generations.length}
		cover={first.cover}
		{eager}
		transitionName="pack-{pack.id}"
		class="front relative h-full"
	>
		{#snippet caption()}
			<p class="retro text-[0.5rem] tracking-[0.2em]">
				<span class="text-holo">BOOSTER PACK</span>
			</p>
			<p class="text-sm">
				<span class="font-medium text-foreground">{plural(models.length, 'model')}</span>
				<span class="text-muted-foreground">· {models.join(', ')}</span>
			</p>
			<p class="text-xs text-muted-foreground">Latest {formatDate(pack.date)}</p>
		{/snippet}
	</BoosterPack>
</a>

<style>
	.pack-tile {
		transition: translate 150ms;
	}
	.pack-tile:is(:hover, :focus-visible) {
		translate: 0 -4px;
	}

	/* A card back: the site's holo colours under a fine dither, darker the deeper it sits. It
	   peeks out down and to the right, inside the wall's gap, never above the row's top edge. */
	.back {
		background:
			repeating-conic-gradient(rgb(255 255 255 / 0.18) 0 25%, transparent 0 50%) 0 0 / 4px 4px,
			linear-gradient(160deg, var(--holo-3), var(--holo-2) 45%, var(--holo-4) 80%, var(--holo-5));
		filter: brightness(calc(1 - var(--d) * 0.22));
		translate: calc(var(--d) * 6px) calc(var(--d) * 6px);
		transform-origin: 0% 100%;
		transition: rotate 220ms cubic-bezier(0.2, 1.3, 0.4, 1);
	}
	.pack-tile:is(:hover, :focus-visible) .back {
		rotate: calc(var(--d) * 2.5deg);
	}

	@media (prefers-reduced-motion: reduce) {
		.pack-tile,
		.back {
			transition: none;
		}
	}
</style>
