<script lang="ts">
	import type { Snippet } from 'svelte';
	import CloseIcon from '~icons/pixelarticons/close';
	import { Button } from '#shared/ui/8bit/index.js';
	import { playSound } from '#shared/lib/sound/index.js';

	interface Props {
		open: boolean;
		/** Accessible name of the dialog. */
		label: string;
		/** The content, given the CSS size of the box it must fit. */
		children: Snippet<[{ width: number; height: number }]>;
		/** A line under the content, e.g. the piece's title. */
		caption?: Snippet;
	}

	let { open = $bindable(), label, children, caption }: Props = $props();

	let width = $state(0);
	let height = $state(0);

	// A native <dialog>: focus is trapped and restored, Escape closes it, and the page behind is
	// inert, without any of that re-implemented here.
	function modal(dialog: HTMLDialogElement) {
		if (!dialog.open) dialog.showModal();
		playSound('expand');
		const scroll = document.documentElement.style.overflow;
		document.documentElement.style.overflow = 'hidden';
		return () => {
			document.documentElement.style.overflow = scroll;
			// Every way out (button, backdrop, Escape, `open = false`) unmounts the dialog here.
			playSound('collapse');
			// Closed from our side (button, backdrop, `open = false`) the dialog is only unmounted;
			// close() is what hands focus back to the element that opened it.
			if (dialog.open) dialog.close();
		};
	}
</script>

{#if open}
	<dialog
		{@attach modal}
		aria-label={label}
		class="lightbox m-0 h-dvh max-h-none w-dvw max-w-none overflow-hidden bg-transparent p-0 text-inherit"
		onclose={() => (open = false)}
		onclick={(event) => {
			// A click on the backdrop, not on the art or a control, closes it.
			if (
				event.target === event.currentTarget ||
				(event.target as HTMLElement).dataset.lightboxStage !== undefined
			)
				open = false;
		}}
	>
		<div class="flex h-full w-full flex-col p-4 sm:p-8" data-lightbox-stage>
			<div
				class="grid min-h-0 flex-1 place-items-center"
				data-lightbox-stage
				bind:clientWidth={width}
				bind:clientHeight={height}
			>
				{#if width > 0 && height > 0}
					{@render children({ width, height })}
				{/if}
			</div>
			{#if caption}
				<div class="mx-auto mt-4 max-w-3xl text-center text-sm text-foreground">
					{@render caption()}
				</div>
			{/if}
		</div>
		<!-- The site's own pixel button, the same one as every other icon control. -->
		<div class="absolute top-4 right-4">
			<Button variant="outline" size="icon" aria-label="Close" onclick={() => (open = false)}>
				<CloseIcon aria-hidden="true" />
			</Button>
		</div>
	</dialog>
{/if}

<style>
	.lightbox::backdrop {
		background: rgb(8 7 12 / 0.82);
		backdrop-filter: blur(14px) saturate(1.3);
	}
	.lightbox[open] {
		animation: lightbox-in 160ms steps(4, end);
	}
	@keyframes lightbox-in {
		from {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.lightbox[open] {
			animation: none;
		}
	}
</style>
