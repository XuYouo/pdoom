<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatDate } from '#shared/lib/format.js';
	import { ArtCard } from '#shared/ui/pixel/index.js';
	import type { GenerationSummary } from '../model/types';

	interface Props {
		generation: GenerationSummary;
		eager?: boolean;
	}

	let { generation, eager = false }: Props = $props();
</script>

{#snippet scoreGem()}
	{#if generation.points !== null}
		<span aria-label="Score {generation.points} out of 100">{generation.points}</span>
	{/if}
{/snippet}

<ArtCard
	href={resolve('/g/[id]', { id: generation.id })}
	art={{
		src: generation.cover.url,
		width: generation.cover.width,
		height: generation.cover.height,
		pixel: generation.cover.pixel
	}}
	alt={generation.title}
	title={generation.title}
	badge={generation.points !== null ? scoreGem : undefined}
	transitionName="art-{generation.id}"
	{eager}
>
	{#snippet caption()}
		<p class="text-sm">
			<span class="font-medium text-foreground">{generation.modelLabel}</span>
			<span class="text-muted-foreground">· v{generation.plugin} in {generation.harness}</span>
		</p>
		<p class="text-xs text-muted-foreground">{formatDate(generation.date)}</p>
		{#if generation.benchmark}
			<p class="text-xs text-muted-foreground">
				{generation.benchmark.promptTitle}{#if generation.outdated}, unranked{/if}
			</p>
		{/if}
	{/snippet}
</ArtCard>
