<script lang="ts">
	// Ported to Svelte 5 from 8bitcn/ui (MIT, see ../LICENSE): components/ui/8bit/separator.tsx
	import { Separator as SeparatorPrimitive } from 'bits-ui';
	import { cn } from '#shared/lib/utils.js';

	let {
		class: className,
		orientation = 'horizontal',
		decorative = true
	}: { class?: string; orientation?: 'horizontal' | 'vertical'; decorative?: boolean } = $props();
</script>

<SeparatorPrimitive.Root
	data-slot="separator-root"
	{decorative}
	{orientation}
	class={cn(
		'shrink-0 data-[orientation=horizontal]:h-0.5 data-[orientation=horizontal]:w-full data-[orientation=horizontal]:bg-[linear-gradient(90deg,var(--foreground)_75%,transparent_75%)] data-[orientation=horizontal]:bg-[length:16px_8px] data-[orientation=vertical]:h-full data-[orientation=vertical]:w-0.5 data-[orientation=vertical]:bg-[linear-gradient(0deg,var(--foreground)_75%,transparent_75%)] data-[orientation=vertical]:bg-[length:2px_16px] dark:data-[orientation=horizontal]:bg-[linear-gradient(90deg,var(--ring)_75%,transparent_75%)] dark:data-[orientation=vertical]:bg-[linear-gradient(0deg,var(--ring)_75%,transparent_75%)]',
		className
	)}
/>
