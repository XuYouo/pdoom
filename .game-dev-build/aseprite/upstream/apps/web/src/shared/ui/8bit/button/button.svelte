<script lang="ts" module>
	import type { ButtonProps } from '#shared/ui/button/index.js';

	export type BitButtonProps = ButtonProps & {
		/** `retro` (the default) sets Press Start 2P, as 8bitcn does. */
		font?: 'normal' | 'retro';
	};
</script>

<script lang="ts">
	// Ported to Svelte 5 from 8bitcn/ui (MIT, see ../LICENSE): components/ui/8bit/button.tsx
	import { Button as ShadcnButton } from '#shared/ui/button/index.js';
	import { cn } from '#shared/lib/utils.js';

	let {
		class: className,
		font,
		size = 'default',
		variant = 'default',
		ref = $bindable(null),
		children,
		...restProps
	}: BitButtonProps = $props();
</script>

<ShadcnButton
	bind:ref
	{...restProps}
	{size}
	{variant}
	class={cn(
		'relative inline-flex items-center justify-center gap-1.5 rounded-none border-none transition-[translate,scale] duration-150 active:translate-y-1',
		// Framed buttons rise a step under the pointer, the frame decorations with them.
		variant !== 'ghost' &&
			variant !== 'link' &&
			'hover:-translate-y-0.5 motion-reduce:hover:translate-y-0',
		size === 'icon' && 'mx-1 my-0',
		font !== 'normal' && 'retro',
		className
	)}
>
	{@render children?.()}
	<span aria-hidden="true" class="pointer-events-none contents" data-slot="button-decorations">
		{#if variant !== 'ghost' && variant !== 'link' && size !== 'icon'}
			<span class="absolute -top-1.5 left-1.5 h-1.5 w-1/2 bg-pixel"></span>
			<span class="absolute -top-1.5 right-1.5 h-1.5 w-1/2 bg-pixel"></span>
			<span class="absolute -bottom-1.5 left-1.5 h-1.5 w-1/2 bg-pixel"></span>
			<span class="absolute right-1.5 -bottom-1.5 h-1.5 w-1/2 bg-pixel"></span>
			<span class="absolute top-0 left-0 size-1.5 bg-pixel"></span>
			<span class="absolute top-0 right-0 size-1.5 bg-pixel"></span>
			<span class="absolute bottom-0 left-0 size-1.5 bg-pixel"></span>
			<span class="absolute right-0 bottom-0 size-1.5 bg-pixel"></span>
			<span class="absolute top-1.5 -left-1.5 h-[calc(100%-12px)] w-1.5 bg-pixel"></span>
			<span class="absolute top-1.5 -right-1.5 h-[calc(100%-12px)] w-1.5 bg-pixel"></span>
			{#if variant !== 'outline'}
				<span class="absolute top-0 left-0 h-1.5 w-full bg-foreground/20"></span>
				<span class="absolute top-1.5 left-0 h-1.5 w-3 bg-foreground/20"></span>
				<span class="absolute bottom-0 left-0 h-1.5 w-full bg-foreground/20"></span>
				<span class="absolute right-0 bottom-1.5 h-1.5 w-3 bg-foreground/20"></span>
			{/if}
		{/if}
		{#if size === 'icon'}
			<span class="absolute top-0 left-0 h-[5px] w-full bg-pixel md:h-1.5"></span>
			<span class="absolute bottom-0 h-[5px] w-full bg-pixel md:h-1.5"></span>
			<span class="absolute top-1 -left-1 h-1/2 w-[5px] bg-pixel md:w-1.5"></span>
			<span class="absolute bottom-1 -left-1 h-1/2 w-[5px] bg-pixel md:w-1.5"></span>
			<span class="absolute top-1 -right-1 h-1/2 w-[5px] bg-pixel md:w-1.5"></span>
			<span class="absolute -right-1 bottom-1 h-1/2 w-[5px] bg-pixel md:w-1.5"></span>
		{/if}
	</span>
</ShadcnButton>
