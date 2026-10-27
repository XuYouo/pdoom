<script lang="ts">
	import { prefersReducedMotion } from 'svelte/motion';
	import PixelSprite from './PixelSprite.svelte';

	interface Props {
		frames: string[][];
		durations: readonly number[];
		/** Largest scale; shrinks by whole steps to fit the container. */
		scale: number;
		label?: string;
		class?: string;
	}

	let { frames, durations, scale, label, class: className }: Props = $props();

	let index = $state(0);
	let available = $state<number | null>(null);

	// A whole-number scale that fits the container: a CSS-shrunk SVG would give uneven pixels.
	const fitted = $derived.by(() => {
		const width = Math.max(...frames[0]!.map((row) => row.length));
		return available ? Math.max(1, Math.min(scale, Math.floor(available / width))) : scale;
	});

	// Reduced motion holds the first frame; otherwise each frame waits its own duration, as Aseprite plays it.
	$effect(() => {
		if (prefersReducedMotion.current) {
			index = 0;
			return;
		}
		const timer = setTimeout(() => (index = (index + 1) % frames.length), durations[index] ?? 100);
		return () => clearTimeout(timer);
	});
</script>

<div class="flex w-full min-w-0 justify-center justify-self-stretch" bind:clientWidth={available}>
	<PixelSprite rows={frames[index]!} scale={fitted} {label} class={className} />
</div>
