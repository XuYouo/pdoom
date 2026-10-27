<script lang="ts">
	// Ported to Svelte 5 from 8bitcn/ui (MIT, see ../LICENSE): components/ui/8bit/select.tsx
	import type { ComponentProps } from 'svelte';
	import { SelectContent as ShadcnSelectContent } from '#shared/ui/select/index.js';
	import { cn } from '#shared/lib/utils.js';
	import OpenSound from './select-open-sound.svelte';

	let {
		class: className,
		font,
		children,
		...restProps
	}: ComponentProps<typeof ShadcnSelectContent> & { font?: 'normal' | 'retro' } = $props();
</script>

<ShadcnSelectContent
	{...restProps}
	class={cn(
		font !== 'normal' && 'retro',
		className,
		'relative mt-1 -ml-1 rounded-none border-4 border-pixel bg-popover shadow-[4px_4px_0_var(--pixel)]'
	)}
>
	<!-- The list opens on pointerdown and covers its own trigger, so the click that follows lands
	on the list, not on the trigger the page-wide click sounds would recognise. The list
	announces itself instead: this renders only while it is open. -->
	<OpenSound />
	{@render children?.()}
</ShadcnSelectContent>
