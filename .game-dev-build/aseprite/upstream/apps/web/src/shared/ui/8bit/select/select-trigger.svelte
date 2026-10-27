<script lang="ts">
	// Ported to Svelte 5 from 8bitcn/ui (MIT, see ../LICENSE): components/ui/8bit/select.tsx
	import type { ComponentProps } from 'svelte';
	import { SelectTrigger as ShadcnSelectTrigger } from '#shared/ui/select/index.js';
	import { cn } from '#shared/lib/utils.js';

	let {
		class: className,
		font,
		children,
		...restProps
	}: ComponentProps<typeof ShadcnSelectTrigger> & { font?: 'normal' | 'retro' } = $props();
</script>

<div
	class={cn(
		'group/field relative border-y-6 border-pixel focus-within:border-accent hover:border-foreground/70 has-data-[state=open]:border-accent',
		className,
		font !== 'normal' && 'retro'
	)}
>
	<ShadcnSelectTrigger {...restProps} class={cn('w-full rounded-none border-0 ring-0', className)}>
		{@render children?.()}
	</ShadcnSelectTrigger>
	<div
		class="pointer-events-none absolute inset-0 -mx-1.5 border-x-6 border-pixel transition-colors duration-150 group-focus-within/field:border-accent group-hover/field:border-foreground/70 group-has-data-[state=open]/field:border-accent"
		aria-hidden="true"
	></div>
</div>
