<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	export const emptyMediaVariants = tv({
		base: 'flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0',
		variants: {
			variant: {
				default: 'bg-transparent',
				icon: 'bg-muted text-accent-ink relative flex size-12 shrink-0 items-center justify-center'
			},
			font: { normal: '', retro: 'retro' }
		},
		defaultVariants: { variant: 'default', font: 'retro' }
	});
</script>

<script lang="ts">
	// Ported to Svelte 5 from 8bitcn/ui (MIT, see ../LICENSE): components/ui/8bit/empty.tsx
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '#shared/lib/utils.js';

	let {
		class: className,
		variant = 'default',
		children,
		...restProps
	}: Omit<HTMLAttributes<HTMLDivElement>, 'class'> & {
		class?: string;
		variant?: 'default' | 'icon';
	} = $props();
</script>

<div class={cn('relative size-max', className)}>
	<div
		data-slot="empty-icon"
		data-variant={variant}
		class={emptyMediaVariants({ variant, class: className })}
		{...restProps}
	>
		{@render children?.()}
	</div>
	{#if variant !== 'default'}
		<div class="pointer-events-none absolute top-0 left-0 h-1.5 w-full bg-pixel"></div>
		<div class="pointer-events-none absolute bottom-0 h-1.5 w-full bg-pixel"></div>
		<div class="pointer-events-none absolute top-1.5 -left-1.5 h-1/2 w-1.5 bg-pixel"></div>
		<div class="pointer-events-none absolute bottom-1.5 -left-1.5 h-1/2 w-1.5 bg-pixel"></div>
		<div class="pointer-events-none absolute top-1.5 -right-1.5 h-1/2 w-1.5 bg-pixel"></div>
		<div class="pointer-events-none absolute -right-1.5 bottom-1.5 h-1/2 w-1.5 bg-pixel"></div>
	{/if}
</div>
