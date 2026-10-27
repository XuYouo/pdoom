<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	export const tableVariants = tv({
		base: '',
		variants: {
			variant: {
				default: 'border-pixel border-y-6 p-4 py-2.5',
				borderless: ''
			},
			font: { normal: '', retro: 'retro' }
		},
		defaultVariants: { font: 'retro', variant: 'default' }
	});
</script>

<script lang="ts">
	// Ported to Svelte 5 from 8bitcn/ui (MIT, see ../LICENSE): components/ui/8bit/table.tsx
	import type { HTMLTableAttributes } from 'svelte/elements';
	import { Table as ShadcnTable } from '#shared/ui/table/index.js';
	import { cn } from '#shared/lib/utils.js';

	let {
		class: className,
		font,
		variant,
		containerClass,
		children,
		...restProps
	}: HTMLTableAttributes & {
		font?: 'normal' | 'retro';
		variant?: 'default' | 'borderless';
		/** Not in 8bitcn: lets a wide table fill its column instead of 8bitcn's `w-fit`. */
		containerClass?: string;
	} = $props();
</script>

<div
	class={cn('relative flex w-fit justify-center', tableVariants({ font, variant }), containerClass)}
>
	<ShadcnTable {...restProps} class={cn('tabular-nums', className)}>
		{@render children?.()}
	</ShadcnTable>
	{#if variant !== 'borderless'}
		<div
			class="pointer-events-none absolute inset-0 -mx-1.5 border-x-6 border-pixel"
			aria-hidden="true"
		></div>
	{/if}
</div>
