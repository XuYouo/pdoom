<script lang="ts">
	// Ported to Svelte 5 from 8bitcn/ui (MIT, see ../LICENSE): components/ui/8bit/toggle-group.tsx
	// (ToggleGroupItem) with toggle.tsx's on-state fill, which the group item inherits there
	// through shadcn's toggle variants. Always the `outline` look: the pixel frame is what makes
	// it read as a control rather than a label.
	import type { Snippet } from 'svelte';
	import { ToggleGroup as ToggleGroupPrimitive } from 'bits-ui';
	import { cn } from '#shared/lib/utils.js';
	import { toggleItemClass } from './item-style';

	let {
		class: className,
		font,
		children,
		...restProps
	}: Omit<ToggleGroupPrimitive.ItemProps, 'children'> & {
		font?: 'normal' | 'retro';
		children?: Snippet;
	} = $props();
</script>

<ToggleGroupPrimitive.Item
	class={cn(toggleItemClass, font === 'normal' ? 'font-sans text-sm' : 'retro', className)}
	{...restProps}
>
	{@render children?.()}
	<span
		class="pointer-events-none absolute inset-0 -my-1.5 border-y-6 border-pixel"
		aria-hidden="true"
	></span>
	<span
		class="pointer-events-none absolute inset-0 -mx-1.5 border-x-6 border-pixel"
		aria-hidden="true"
	></span>
</ToggleGroupPrimitive.Item>
