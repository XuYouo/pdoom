<script lang="ts">
	// Ported to Svelte 5 from 8bitcn/ui (MIT, see ../LICENSE): components/ui/8bit/collapsible.tsx
	import type { ComponentProps } from 'svelte';
	import { Collapsible as ShadcnCollapsible } from '#shared/ui/collapsible/index.js';
	import { cn } from '#shared/lib/utils.js';

	let {
		class: className,
		open = $bindable(false),
		children,
		...restProps
	}: ComponentProps<typeof ShadcnCollapsible> & { class?: string } = $props();
</script>

<div class={cn('relative', className)}>
	<ShadcnCollapsible bind:open {...restProps} class={cn(className, 'retro')}>
		{@render children?.()}
	</ShadcnCollapsible>
</div>
