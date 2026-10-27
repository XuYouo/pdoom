<script lang="ts">
	// Ported to Svelte 5 from 8bitcn/ui (MIT, see ../LICENSE): components/ui/8bit/toggle-group.tsx
	// Radix's ToggleGroup is swapped for bits-ui's, which shadcn-svelte builds on. Single-select
	// only: that is every use on the site, and it keeps `value` a string.
	import type { Snippet } from 'svelte';
	import { ToggleGroup as ToggleGroupPrimitive } from 'bits-ui';
	import { cn } from '#shared/lib/utils.js';

	interface Props {
		/** The pressed item's value; empty when the pressed item is clicked again. */
		value?: string;
		class?: string;
		font?: 'normal' | 'retro';
		'aria-label'?: string;
		'aria-labelledby'?: string;
		children?: Snippet;
	}

	let { value = $bindable(''), class: className, font, children, ...labels }: Props = $props();
</script>

<!-- Wider gaps than 8bitcn's gap-3: the pixel side bars stand 6px outside each item. -->
<ToggleGroupPrimitive.Root
	type="single"
	bind:value
	class={cn(
		'flex flex-wrap items-center gap-4 px-1.5 py-1.5',
		font !== 'normal' && 'retro',
		className
	)}
	{...labels}
>
	{@render children?.()}
</ToggleGroupPrimitive.Root>
