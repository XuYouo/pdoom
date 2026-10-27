<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Badge, Card, Separator } from '#shared/ui/8bit/index.js';
	import { PICO8 } from '#shared/config/index.js';
	import { CopyButton } from '#features/copyPrompt/index.js';
	import { sequenceText, type PromptView } from '#entities/prompt/index.js';

	interface Props {
		prompt: PromptView;
		chips: string[];
		timeline?: Snippet;
		criteria?: Snippet;
	}

	let { prompt, chips, timeline, criteria }: Props = $props();
</script>

<!-- The benchmark's method: what it tests, the setup, and the prompt word for word. The title
lives in the page hero, so this card opens with the full summary instead. -->
<Card font="normal" class="gap-0 py-0">
	<header class="grid-dots px-5 pt-7 pb-6 sm:px-8">
		<div class="flex flex-wrap items-start justify-between gap-6">
			<p class="max-w-[64ch] min-w-0 text-lg">{prompt.summary}</p>
			<div class="px-1.5">
				<CopyButton
					text={sequenceText(prompt.steps)}
					label="Copy full prompt"
					done="Copied the full prompt"
					variant="default"
					size="default"
				/>
			</div>
		</div>
		<ul class="mt-5 flex flex-wrap gap-3 px-1.5" aria-label="What this benchmark tests">
			{#each chips as chip (chip)}
				<li><Badge variant="secondary" class="text-[0.625rem]">{chip}</Badge></li>
			{/each}
		</ul>
		<dl class="plate mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm">
			<dt class="text-muted-foreground">Canvas</dt>
			<dd class="tabular-nums">
				{prompt.setup.canvas.width}×{prompt.setup.canvas.height}
				{prompt.setup.canvas.colorMode.toUpperCase()}
			</dd>
			{#if prompt.setup.palette}
				<dt class="text-muted-foreground">Palette</dt>
				<dd class="flex items-center gap-2">
					{#if prompt.setup.palette.toLowerCase().replace(/[^a-z0-9]/g, '') === 'pico8'}
						<span class="flex" aria-hidden="true">
							{#each Object.values(PICO8) as color (color)}
								<span class="block size-3" style:background-color={color}></span>
							{/each}
						</span>
					{/if}
					{prompt.setup.palette}
				</dd>
			{/if}
			<dt class="text-muted-foreground">Steps</dt>
			<dd class="tabular-nums">{prompt.steps.length}</dd>
			<dt class="text-muted-foreground">Revision</dt>
			<dd class="tabular-nums">{prompt.revision}</dd>
		</dl>
	</header>
	<Separator />
	<div
		class="grid grid-cols-[minmax(0,1fr)] gap-10 px-5 py-7 sm:px-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-12"
	>
		{@render timeline?.()}
		{@render criteria?.()}
	</div>
</Card>
