<script lang="ts">
	// Ported to Svelte 5 from 8bitcn/ui (MIT, see ../LICENSE): components/ui/8bit/table.tsx
	import type { HTMLAttributes } from 'svelte/elements';
	import { TableHeader as ShadcnTableHeader } from '#shared/ui/table/index.js';
	import { cn } from '#shared/lib/utils.js';

	let {
		class: className,
		children,
		...restProps
	}: HTMLAttributes<HTMLTableSectionElement> = $props();
</script>

<ShadcnTableHeader
	{...restProps}
	class={cn(
		className,
		'border-b-4 border-pixel bg-muted/60 text-muted-foreground [&_th]:text-xs [&_th]:tracking-wide'
	)}
>
	{@render children?.()}
</ShadcnTableHeader>
