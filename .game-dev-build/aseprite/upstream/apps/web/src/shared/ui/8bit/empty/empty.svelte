<script lang="ts">
	// Ported to Svelte 5 from 8bitcn/ui (MIT, see ../LICENSE): components/ui/8bit/empty.tsx
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '#shared/lib/utils.js';

	let {
		class: className,
		font,
		children,
		...restProps
	}: HTMLAttributes<HTMLDivElement> & { font?: 'normal' | 'retro' } = $props();
</script>

<div
	data-slot="empty"
	class={cn(
		'flex min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-lg border-dashed p-6 text-center text-balance md:p-12',
		font !== 'normal' && 'retro',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
