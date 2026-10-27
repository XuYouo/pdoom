<script lang="ts">
	// Ported to Svelte 5 from 8bitcn/ui (MIT, see ../LICENSE): components/ui/8bit/progress.tsx
	import { Progress as ProgressPrimitive } from 'bits-ui';
	import { cn } from '#shared/lib/utils.js';

	let {
		class: className,
		font,
		variant,
		value = 0,
		progressBg,
		segments = 20,
		...restProps
	}: {
		class?: string;
		font?: 'normal' | 'retro';
		variant?: 'default' | 'retro';
		/** 0–100. */
		value?: number;
		/** Tailwind class or CSS colour for the filled part. */
		progressBg?: string;
		/** Not in 8bitcn (fixed at 20): the square count of the retro variant, so a score out of 8 shows 8. */
		segments?: number;
		'aria-label'?: string;
		'aria-valuetext'?: string;
	} = $props();

	const heightClass = $derived(className?.match(/h-(\d+|\[.*?\])/)?.[0] ?? 'h-2');
	const filled = $derived(Math.round((value / 100) * segments));
	const isClass = $derived(
		progressBg !== undefined && !progressBg.startsWith('#') && !progressBg.startsWith('var(')
	);
</script>

<div class={cn('relative w-full', className)}>
	<ProgressPrimitive.Root
		data-slot="progress"
		class={cn(
			'relative w-full overflow-hidden bg-primary/20 [background-image:repeating-linear-gradient(90deg,transparent_0_6px,var(--background)_6px_8px)]',
			heightClass,
			font !== 'normal' && 'retro'
		)}
		{value}
		max={100}
		{...restProps}
	>
		{#if variant === 'retro'}
			<div data-slot="progress-indicator" class="flex h-full w-full">
				{#each { length: segments }, i (i)}
					<div
						class={cn(
							'mx-px h-full flex-1',
							i < filled ? (isClass ? progressBg : !progressBg && 'bg-primary') : 'bg-transparent'
						)}
						style:background-color={i < filled && progressBg && !isClass ? progressBg : undefined}
					></div>
				{/each}
			</div>
		{:else}
			<div
				data-slot="progress-indicator"
				class={cn(
					'h-full w-full flex-1 [mask-image:repeating-linear-gradient(90deg,#000_0_6px,transparent_6px_8px)] transition-transform duration-300 ease-[steps(8,end)] motion-reduce:transition-none',
					isClass ? progressBg : !progressBg && 'bg-primary'
				)}
				style:background-color={progressBg && !isClass ? progressBg : undefined}
				style:transform="translateX(-{100 - value}%)"
			></div>
		{/if}
	</ProgressPrimitive.Root>
	<div
		class="pointer-events-none absolute inset-0 -my-1 border-y-4 border-pixel"
		aria-hidden="true"
	></div>
	<div
		class="pointer-events-none absolute inset-0 -mx-1 border-x-4 border-pixel"
		aria-hidden="true"
	></div>
</div>
