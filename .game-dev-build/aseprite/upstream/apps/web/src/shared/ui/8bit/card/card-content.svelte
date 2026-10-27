<script lang="ts">
	// Ported to Svelte 5 from 8bitcn/ui (MIT, see ../LICENSE): components/ui/8bit/card.tsx
	import type { HTMLAttributes } from 'svelte/elements';
	import { CardContent as ShadcnCardContent } from '#shared/ui/card/index.js';
	import { cn } from '#shared/lib/utils.js';

	let {
		class: className,
		font,
		children,
		...restProps
	}: HTMLAttributes<HTMLDivElement> & { font?: 'normal' | 'retro' } = $props();
</script>

<ShadcnCardContent {...restProps} class={cn('flex-1', font !== 'normal' && 'retro', className)}>
	{@render children?.()}
</ShadcnCardContent>
