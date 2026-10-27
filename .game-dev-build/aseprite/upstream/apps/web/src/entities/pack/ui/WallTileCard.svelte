<script lang="ts">
	import { GenerationCard } from '#entities/generation/@x/pack.js';
	import type { WallTile } from '../lib/wall';
	import PackCard from './PackCard.svelte';

	interface Props {
		tile: WallTile;
		eager?: boolean;
	}

	let { tile, eager = false }: Props = $props();
</script>

{#if tile.kind === 'pack'}
	<PackCard pack={tile.pack} {eager} />
{:else}
	<GenerationCard generation={tile.generation} {eager} />
{/if}
