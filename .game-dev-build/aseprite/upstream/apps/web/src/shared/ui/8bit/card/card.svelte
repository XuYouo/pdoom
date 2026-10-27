<script lang="ts">
	// Ported to Svelte 5 from 8bitcn/ui (MIT, see ../LICENSE): components/ui/8bit/card.tsx.
	// Deviation: a rounded 4px frame instead of 8bitcn's square notched one, so every card on the
	// site matches the art cards (shared/ui/pixel/ArtCard).
	import type { HTMLAttributes } from 'svelte/elements';
	import { Card as ShadcnCard } from '#shared/ui/card/index.js';
	import { cn } from '#shared/lib/utils.js';

	let {
		class: className,
		font,
		children,
		...restProps
	}: HTMLAttributes<HTMLDivElement> & { font?: 'normal' | 'retro' } = $props();
</script>

<div
	class={cn('pixel-frame relative overflow-hidden bg-card p-0! text-card-foreground', className)}
>
	<ShadcnCard
		{...restProps}
		class={cn(
			'flex h-full w-full! flex-col rounded-none border-0 bg-card text-card-foreground shadow-none ring-0',
			font !== 'normal' && 'retro',
			className
		)}
	>
		{@render children?.()}
	</ShadcnCard>
</div>
