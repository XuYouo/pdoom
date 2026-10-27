<script lang="ts">
	// Ported to Svelte 5 from 8bitcn/ui (MIT, see ../LICENSE): components/ui/8bit/table.tsx
	import type { HTMLAttributes } from 'svelte/elements';
	import { TableRow as ShadcnTableRow } from '#shared/ui/table/index.js';
	import { cn } from '#shared/lib/utils.js';

	let { class: className, children, ...restProps }: HTMLAttributes<HTMLTableRowElement> = $props();
</script>

<ShadcnTableRow
	{...restProps}
	class={cn(
		className,
		'border-b-4 border-dashed border-pixel transition-colors hover:bg-muted/60 data-[state=selected]:bg-muted'
	)}
>
	{@render children?.()}
</ShadcnTableRow>
