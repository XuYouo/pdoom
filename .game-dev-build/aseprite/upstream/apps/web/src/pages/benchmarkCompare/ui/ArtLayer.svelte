<script lang="ts">
	import type { FileView } from '#entities/generation/index.js';
	import { frameAt, type Gif } from '#shared/lib/gif.js';
	import { loadGif, type Playback } from '../model/playback.svelte';

	interface Props {
		file: FileView;
		alt: string;
		/** Display size in CSS pixels, a whole multiple of the art's native size. */
		width: number;
		height: number;
		playback: Playback;
		class?: string;
		style?: string;
	}

	let { file, alt, width, height, playback, class: className, style }: Props = $props();

	const animated = $derived(file.extension === 'gif');

	let gif = $state.raw<Gif | null>(null);
	let failed = $state(false);
	let frames = $state.raw<ImageBitmap[]>([]);

	// Decode, turn every frame into a bitmap once, and join the shared clock for as long as
	// this layer is on screen.
	$effect(() => {
		if (!animated) return;
		const url = file.url;
		let unregister: (() => void) | null = null;
		let cancelled = false;
		failed = false;
		loadGif(url)
			.then(async (decoded) => {
				const bitmaps = await Promise.all(
					decoded.frames.map((frame) =>
						createImageBitmap(new ImageData(frame.pixels, decoded.width, decoded.height))
					)
				);
				if (cancelled) {
					bitmaps.forEach((bitmap) => bitmap.close());
					return;
				}
				gif = decoded;
				frames = bitmaps;
				unregister = playback.register(url, decoded.duration);
			})
			.catch(() => {
				if (!cancelled) failed = true;
			});
		return () => {
			cancelled = true;
			unregister?.();
			// Bitmaps hold decoded pixels outside the JS heap: release them, not just the references.
			frames.forEach((bitmap) => bitmap.close());
			gif = null;
			frames = [];
		};
	});

	const index = $derived(
		gif && playback.cycle > 0 ? frameAt(gif, playback.position * gif.duration) : 0
	);

	function draw(canvas: HTMLCanvasElement) {
		const bitmap = frames[index];
		if (!bitmap) return;
		const context = canvas.getContext('2d');
		if (!context) return;
		context.clearRect(0, 0, canvas.width, canvas.height);
		context.drawImage(bitmap, 0, 0);
	}
</script>

{#if animated && !failed}
	{#if gif}
		<canvas
			{@attach (canvas) => {
				// Re-runs whenever the frame index changes.
				void index;
				draw(canvas);
			}}
			width={gif.width}
			height={gif.height}
			aria-hidden="true"
			class={['pixelated', className]}
			style:width="{width}px"
			style:height="{height}px"
			{style}
		></canvas>
		<span class="sr-only">{alt}</span>
	{:else}
		<div
			class={['animate-pulse bg-muted/40', className]}
			style:width="{width}px"
			style:height="{height}px"
			{style}
		></div>
	{/if}
{:else}
	<!-- A still, or a GIF that would not decode: the browser plays it on its own clock. -->
	<img
		src={file.url}
		{alt}
		{width}
		{height}
		draggable="false"
		class={['pixelated max-w-none', className]}
		{style}
	/>
{/if}
