<script lang="ts">
	// Ported to Svelte 5 from 8bitcn/ui (MIT, see ../LICENSE): components/ui/8bit/slider.tsx
	import { Slider as SliderPrimitive } from 'bits-ui';
	import { cn } from '#shared/lib/utils.js';

	let {
		value = $bindable(0),
		label,
		valueText,
		class: className,
		...restProps
	}: Omit<
		Extract<SliderPrimitive.RootProps, { type: 'single' }>,
		'type' | 'value' | 'children' | 'child'
	> & {
		/** Single-thumb only: every use on this site is one value. */
		value?: number;
		/** Accessible name of the thumb, the element that takes focus. */
		label: string;
		/** Read out instead of the raw number, e.g. "42%". */
		valueText?: string;
	} = $props();
</script>

<div class={cn('relative w-full', className)}>
	<SliderPrimitive.Root
		type="single"
		bind:value
		data-slot="slider"
		class="relative flex w-full touch-none items-center select-none data-disabled:opacity-50"
		{...restProps}
	>
		{#snippet children({ thumbItems })}
			<span data-slot="slider-track" class="relative h-2 w-full grow overflow-hidden bg-secondary">
				<SliderPrimitive.Range
					data-slot="slider-range"
					class="absolute h-full bg-primary [mask-image:repeating-linear-gradient(90deg,#000_0_6px,transparent_6px_8px)]"
				/>
			</span>
			{#each thumbItems as thumb (thumb.index)}
				<SliderPrimitive.Thumb
					index={thumb.index}
					aria-label={label}
					aria-valuetext={valueText}
					data-slot="slider-thumb"
					class="block size-5 cursor-grab border-2 border-accent-foreground bg-accent transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:cursor-grabbing disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none"
				/>
			{/each}
		{/snippet}
	</SliderPrimitive.Root>
	<div
		class="pointer-events-none absolute inset-0 -my-1 border-y-4 border-pixel"
		aria-hidden="true"
	></div>
	<div
		class="pointer-events-none absolute inset-0 -mx-1 border-x-4 border-pixel"
		aria-hidden="true"
	></div>
</div>
