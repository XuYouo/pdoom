<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	export const badgeVariants = tv({
		base: '',
		variants: {
			font: { normal: '', retro: 'retro' },
			variant: {
				default: 'border-primary bg-primary',
				destructive: 'border-destructive bg-destructive',
				outline: 'border-background bg-background',
				secondary: 'border-secondary bg-secondary'
			}
		},
		defaultVariants: { variant: 'default' }
	});
</script>

<script lang="ts">
	// Ported to Svelte 5 from 8bitcn/ui (MIT, see ../LICENSE): components/ui/8bit/badge.tsx
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import { Badge as ShadcnBadge } from '#shared/ui/badge/index.js';
	import { cn } from '#shared/lib/utils.js';

	let {
		class: className = '',
		font,
		variant = 'default',
		children,
		...restProps
	}: Omit<HTMLAnchorAttributes, 'class'> & {
		class?: string;
		font?: 'normal' | 'retro';
		variant?: 'default' | 'destructive' | 'outline' | 'secondary';
	} = $props();

	// Colour classes go to the badge and its pixel side bars; everything else sizes the wrapper.
	const isVisual = (c: string) => /^(bg-|border-|text-|rounded-)/.test(c);
	const classes = $derived(className.split(' ').filter(Boolean));
	const visual = $derived(classes.filter(isVisual));
	const container = $derived(classes.filter((c) => !isVisual(c)));
	const color = $derived(badgeVariants({ variant, font }));
</script>

<span class={cn('relative inline-flex items-stretch', container)}>
	<ShadcnBadge
		{...restProps}
		{variant}
		class={cn(
			'h-full w-full rounded-none leading-none tracking-wide',
			font !== 'normal' && 'retro',
			visual
		)}
	>
		{@render children?.()}
	</ShadcnBadge>
	<span aria-hidden="true" class={cn('absolute inset-y-[4px] -left-1.5 w-1.5', color, visual)}
	></span>
	<span aria-hidden="true" class={cn('absolute inset-y-[4px] -right-1.5 w-1.5', color, visual)}
	></span>
</span>
