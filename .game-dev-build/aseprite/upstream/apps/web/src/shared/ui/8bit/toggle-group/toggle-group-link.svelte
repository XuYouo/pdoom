<script lang="ts">
	// A link drawn as a toggle-group item (./toggle-group-item.svelte), for navigation rows that
	// sit beside real toggles: in-page section jumps, for one. Navigation stays an <a>, not a
	// toggle, so it keeps link semantics, middle-click and the URL hash.
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import { cn } from '#shared/lib/utils.js';
	import { toggleItemClass } from './item-style';

	let {
		class: className,
		font,
		children,
		...restProps
	}: HTMLAnchorAttributes & { font?: 'normal' | 'retro' } = $props();
</script>

<a
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
</a>
