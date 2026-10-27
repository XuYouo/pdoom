<script lang="ts">
	import {
		FileImage,
		roleLabel,
		type FileView,
		type GenerationDetail
	} from '#entities/generation/index.js';
	import StripView from './StripView.svelte';

	interface Props {
		generation: GenerationDetail;
	}

	let { generation: g }: Props = $props();

	const views = $derived(g.files.filter((file) => file.role !== 'cover' && file.width !== null));

	/** A filmstrip or a one-row sheet: far wider than tall, so it gets a whole row and scrolls. */
	const isStrip = (file: FileView) =>
		file.role === 'filmstrip' || (file.width ?? 0) > (file.height ?? 1) * 3;
</script>

{#if views.length > 0}
	<section aria-labelledby="views">
		<h2 id="views" class="section-title text-lg sm:text-2xl">More views</h2>
		<!-- `grid-cols-1`, not the implicit auto track: an auto track grows to a filmstrip's full
		width on a phone, and the strip is meant to scroll inside its frame instead. -->
		<ul class="mt-8 grid grid-cols-1 gap-12 px-1.5 sm:grid-cols-2">
			{#each views as file (file.name)}
				<li class={['min-w-0', isStrip(file) && 'sm:col-span-2']}>
					<div class="pixel-frame overflow-hidden bg-card">
						{#if isStrip(file)}
							<StripView {file} alt="{file.label ?? roleLabel[file.role]} of {g.title}" />
						{:else}
							<div class="canvas-checker overflow-hidden">
								<FileImage
									{file}
									alt="{file.label ?? roleLabel[file.role]} of {g.title}"
									minHeight={200}
									zoomable
								/>
							</div>
						{/if}
						<p class="border-t-4 border-pixel/40 bg-card px-4 py-3 text-sm">
							<span class="font-medium">{file.label ?? roleLabel[file.role]}</span>
							{#if file.step}<span class="text-muted-foreground">, step {file.step}</span>{/if}
						</p>
					</div>
				</li>
			{/each}
		</ul>
	</section>
{/if}
