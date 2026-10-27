<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import { cn } from '#shared/lib/utils.js';

	interface Props {
		items: T[];
		key: (item: T) => string;
		/** The item; `index` is its position in `items`, not in its column. */
		item: Snippet<[T, number]>;
		/** Column count from the list's own width: `[minWidth, columns]`, widest first. */
		breakpoints?: [number, number][];
		class?: string;
	}

	let {
		items,
		key,
		item,
		breakpoints = [
			[960, 3],
			[520, 2]
		],
		class: className
	}: Props = $props();

	let width = $state<number | null>(null);

	// Before the first measurement (and without JS) one column: never a wrong guess at width.
	const columns = $derived(
		width === null ? 1 : (breakpoints.find(([min]) => width! >= min)?.[1] ?? 1)
	);

	// Round-robin, not CSS columns: CSS columns fill top-to-bottom, which would read a
	// newest-first list down the first column instead of across the first row.
	const lanes = $derived.by(() => {
		const out: { item: T; index: number }[][] = Array.from({ length: columns }, () => []);
		items.forEach((entry, index) => out[index % columns]!.push({ item: entry, index }));
		return out;
	});
</script>

<div class={cn('flex items-start gap-6 sm:gap-8', className)} bind:clientWidth={width}>
	{#each lanes as lane, lane_index (lane_index)}
		<ul class="flex min-w-0 flex-1 flex-col gap-8 sm:gap-10">
			{#each lane as entry (key(entry.item))}
				<li>{@render item(entry.item, entry.index)}</li>
			{/each}
		</ul>
	{/each}
</div>
