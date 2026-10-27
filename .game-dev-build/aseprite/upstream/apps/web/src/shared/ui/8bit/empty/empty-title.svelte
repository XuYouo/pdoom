<script lang="ts">
	// Ported to Svelte 5 from 8bitcn/ui (MIT, see ../LICENSE): components/ui/8bit/empty.tsx
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '#shared/lib/utils.js';

	let { class: className, children, ...restProps }: HTMLAttributes<HTMLElement> = $props();
</script>

<div
	data-slot="empty-title"
	class={cn('text-lg font-medium tracking-tight', className)}
	{...restProps}
>
	{@render children?.()}
</div>
