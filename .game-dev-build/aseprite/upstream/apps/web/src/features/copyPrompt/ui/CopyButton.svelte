<script lang="ts">
	// copyPrompt feature: a button that copies arbitrary text to the clipboard and reports back
	// through the toast. Used in three flavours: a single step, the full sequence, or YAML.
	import CheckIcon from '~icons/pixelarticons/check';
	import CopyIcon from '~icons/pixelarticons/copy';
	import { Button, toast, type BitButtonProps } from '#shared/ui/8bit/index.js';
	import { playSound } from '#shared/lib/sound/index.js';

	type Props = BitButtonProps & {
		text: string;
		label: string;
		done?: string;
		/** Show only the icon; `label` stays the button's accessible name. */
		iconOnly?: boolean;
	};

	let {
		text,
		label,
		done,
		iconOnly = false,
		variant = 'outline',
		size = 'sm',
		class: className
	}: Props = $props();

	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			playSound('error');
			toast('Copy failed: the browser blocked the clipboard. Select the text instead.');
			return;
		}
		playSound('confirm');
		toast(done ?? `Copied: ${label.toLowerCase()}`);
		copied = true;
		clearTimeout(timer);
		timer = setTimeout(() => (copied = false), 1600);
	}
</script>

<!-- Silent on the click itself: the copy answers with success or failure once it settles. -->
<Button {variant} {size} class={className} data-sound="none" onclick={copy}>
	{#if copied}
		<CheckIcon aria-hidden="true" />
	{:else}
		<CopyIcon aria-hidden="true" />
	{/if}
	<span class={iconOnly ? 'sr-only' : undefined}>{label}</span>
</Button>
