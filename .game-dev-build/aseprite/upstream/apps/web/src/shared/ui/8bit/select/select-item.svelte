<script lang="ts">
	// Ported to Svelte 5 from 8bitcn/ui (MIT, see ../LICENSE): components/ui/8bit/select.tsx
	import type { ComponentProps } from 'svelte';
	import { SelectItem as ShadcnSelectItem } from '#shared/ui/select/index.js';
	import { cn } from '#shared/lib/utils.js';

	let {
		class: className,
		children,
		...restProps
	}: ComponentProps<typeof ShadcnSelectItem> = $props();
</script>

<ShadcnSelectItem
	{...restProps}
	{children}
	class={cn(
		className,
		"relative rounded-none border-y-3 border-dashed border-ring/0 transition-colors hover:border-foreground hover:bg-muted focus:bg-muted data-highlighted:bg-muted data-highlighted:before:absolute data-highlighted:before:top-1/2 data-highlighted:before:left-0 data-highlighted:before:h-3 data-highlighted:before:w-1.5 data-highlighted:before:-translate-y-1/2 data-highlighted:before:bg-accent data-highlighted:before:content-[''] data-[state=checked]:bg-muted data-[state=checked]:before:absolute data-[state=checked]:before:top-1/2 data-[state=checked]:before:left-0 data-[state=checked]:before:h-3 data-[state=checked]:before:w-1.5 data-[state=checked]:before:-translate-y-1/2 data-[state=checked]:before:bg-accent data-[state=checked]:before:content-[''] dark:hover:border-ring"
	)}
/>
