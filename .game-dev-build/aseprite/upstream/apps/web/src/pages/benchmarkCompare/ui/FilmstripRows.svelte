<script lang="ts">
	import type { FileView } from '#entities/generation/index.js';
	import type { CompareRun } from '../model/types';
	import RunCaption from './RunCaption.svelte';

	interface Props {
		runs: CompareRun[];
		viewKey: string;
		label: (run: CompareRun) => string;
	}

	let { runs, viewKey, label }: Props = $props();

	let viewport = $state(1024);
	/** Target strip height: 300px on a desktop, 200px on a phone. */
	const target = $derived(viewport < 640 ? 200 : 300);

	// Every strip is exactly the target height; its width follows. Nothing in the strip is
	// cropped or retimed — it is the file as the run exported it, only scaled.
	const size = (file: FileView) => {
		if (!file.width || !file.height) return null;
		return { width: (file.width * target) / file.height, height: target };
	};
</script>

<svelte:window bind:innerWidth={viewport} />

<!-- The full width of the screen, not of the page column: a filmstrip is one long row of frames,
and every extra pixel of width is a frame more on screen. One scroller for every strip, so
they move together. -->
<div class="relative left-1/2 w-screen -translate-x-1/2 overflow-x-auto">
	<div class="inline-flex min-w-full flex-col gap-8 px-4 py-2 sm:px-6">
		{#each runs as run (run.id)}
			{@const file = run.images[viewKey]}
			<div class="space-y-3">
				<div class="sticky left-4 max-w-sm sm:left-6">
					<RunCaption {run} />
				</div>
				{#if file}
					{@const fitted = size(file)}
					<div class="w-fit">
						<img
							src={file.url}
							alt={label(run)}
							width={fitted?.width}
							height={fitted?.height}
							loading="lazy"
							decoding="async"
							class="canvas-checker pixelated pixel-notch block max-w-none [--notch:4px]"
							style:height={fitted ? undefined : `${target}px`}
						/>
					</div>
				{:else}
					<p class="text-sm text-muted-foreground">No filmstrip in this run.</p>
				{/if}
			</div>
		{/each}
	</div>
</div>
