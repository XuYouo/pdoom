<script lang="ts">
	// Ported to Svelte 5 from 8bitcn/ui (MIT, see ../LICENSE): components/ui/8bit/empty.tsx
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '#shared/lib/utils.js';

	let { class: className, children, ...restProps }: HTMLAttributes<HTMLElement> = $props();
</script>

<div
	data-slot="empty-content"
	class={cn(
		'flex w-full max-w-sm min-w-0 flex-col items-center gap-4 text-sm text-balance',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
