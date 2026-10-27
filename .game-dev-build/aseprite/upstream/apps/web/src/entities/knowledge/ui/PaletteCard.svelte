<script lang="ts">
	// One palette as a card: the colours as its picture, then name, size, author, notes and the
	// key an agent loads it by. Used by the knowledge index (the classics) and the full catalogue.
	import type { Snippet } from 'svelte';
	import ExternalLinkIcon from '~icons/pixelarticons/external-link';
	import { Button } from '#shared/ui/8bit/index.js';

	interface Props {
		/** The key `palette` op `preset` takes. */
		id: string;
		name: string;
		author: string;
		colors: string[];
		notes?: string;
		/** Where the palette is published; adds a link. */
		source?: string;
		/** Heading level inside the page's outline. */
		heading?: 'h2' | 'h3';
		/** Controls beside the key, e.g. a copy button (features stay out of entities). */
		actions?: Snippet;
	}

	let { id, name, author, colors, notes, source, heading = 'h3', actions }: Props = $props();

	// The swatch block is a few gradient rows, not one element per colour: thousands of cards
	// pile up under infinite scroll. Up to sixteen colours fill one row edge to edge; more wrap at
	// sixteen a row, so a 256-colour palette reads as a block and its columns line up.
	const rows = $derived.by(() => {
		const columns = Math.min(colors.length, 16);
		const step = 100 / columns;
		return Array.from({ length: Math.ceil(colors.length / columns) }, (_, r) => {
			const slice = colors.slice(r * columns, r * columns + columns);
			const stops = slice.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`);
			if (slice.length < columns) stops.push(`transparent ${slice.length * step}% 100%`);
			return `linear-gradient(to right, ${stops.join(', ')})`;
		});
	});
</script>

<!-- Rounded the way the rest of the site rounds a card: `pixel-frame` steps the corners one art
pixel at a time instead of a smooth border-radius arc. The lift sits on a wrapper because the
frame clip-paths itself. -->
<div
	class="h-full transition-[translate] duration-150 hover:-translate-y-1 motion-reduce:hover:translate-y-0"
>
	<article class="pixel-frame flex h-full flex-col bg-card">
		<!-- The palette is the card's picture: a fixed-height block, so every card in a row lines up
	whatever its colour count. Gradient stops are hard, so every swatch stays crisp. -->
		<div
			class="canvas-checker flex h-28 flex-col border-b-4 border-pixel"
			role="img"
			aria-label="{name}: {colors.length} colours"
			title={colors.join(' ')}
		>
			{#each rows as background, index (index)}
				<div class="min-h-0 flex-1" style:background-image={background}></div>
			{/each}
		</div>
		<div class="flex flex-1 flex-col p-4">
			<div class="flex items-start justify-between gap-3">
				<svelte:element
					this={heading}
					class="min-w-0 font-sans text-lg leading-snug font-semibold break-words"
					>{name}</svelte:element
				>
				<span
					class="gem shrink-0 px-1.5 py-0.5 retro text-[0.625rem] tabular-nums"
					aria-label="{colors.length} colours">{colors.length}</span
				>
			</div>
			<p class="mt-0.5 truncate text-sm text-muted-foreground">by {author}</p>
			{#if notes}
				<p class="mt-3 line-clamp-2 text-sm text-muted-foreground">{notes}</p>
			{/if}
			<div class="min-h-4 flex-1" aria-hidden="true"></div>
			<div
				class="flex items-center justify-between gap-2 border-t-2 border-dashed border-border pt-3"
			>
				<code class="min-w-0 truncate text-sm text-primary-ink" title={id}>{id}</code>
				<div class="flex shrink-0 items-center">
					{@render actions?.()}
					{#if source}
						<Button
							href={source}
							rel="noopener"
							variant="ghost"
							size="sm"
							class="size-10 px-0"
							aria-label="{name} on Lospec"
						>
							<ExternalLinkIcon aria-hidden="true" />
						</Button>
					{/if}
				</div>
			</div>
		</div>
	</article>
</div>
