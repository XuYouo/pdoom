<script lang="ts">
	// Ported to Svelte 5 from 8bitcn/ui (MIT, see ../LICENSE): components/ui/8bit/input.tsx
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { Input as ShadcnInput } from '#shared/ui/input/index.js';
	import { cn } from '#shared/lib/utils.js';

	let {
		class: className,
		font,
		value = $bindable(),
		ref = $bindable(null),
		...restProps
	}: Omit<HTMLInputAttributes, 'type' | 'files'> & {
		type?: 'text' | 'search' | 'email' | 'url' | 'number' | 'password' | 'tel';
		font?: 'normal' | 'retro';
		ref?: HTMLInputElement | null;
	} = $props();
</script>

<div
	class={cn(
		'group/field relative flex items-center border-y-6 border-foreground p-0! focus-within:border-accent hover:border-foreground/70 dark:border-ring dark:focus-within:border-accent dark:hover:border-foreground/60',
		className
	)}
>
	<ShadcnInput
		bind:ref
		bind:value
		{...restProps}
		class={cn(
			'w-full! rounded-none ring-0 placeholder:text-muted-foreground/80',
			font !== 'normal' && 'retro',
			className
		)}
	/>
	<div
		class="pointer-events-none absolute inset-0 -mx-1.5 border-x-6 border-pixel transition-colors duration-150 group-focus-within/field:border-accent group-hover/field:border-foreground/70"
		aria-hidden="true"
	></div>
</div>
