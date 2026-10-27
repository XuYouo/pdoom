<script lang="ts">
	import CheckIcon from '~icons/pixelarticons/check';
	import { plural } from '#shared/lib/format.js';
	import type { PromptView } from '#entities/prompt/index.js';

	interface Props {
		prompt: PromptView;
	}

	let { prompt }: Props = $props();

	const byStep = $derived(
		prompt.steps.map((step, index) => ({
			step,
			number: index + 1,
			criteria: prompt.criteria.filter((criterion) => criterion.step === index + 1)
		}))
	);
</script>

<section aria-labelledby={`criteria-${prompt.id}`}>
	<h2 id={`criteria-${prompt.id}`} class="section-title text-sm sm:text-base">
		{plural(prompt.criteria.length, 'criterion', 'criteria')}
	</h2>
	<ol class="mt-6 space-y-6">
		{#each byStep as group (group.number)}
			{#if group.criteria.length > 0}
				<li>
					<p class="flex items-center gap-3 text-sm font-medium text-muted-foreground">
						<span
							class="gem flex size-6 items-center justify-center retro text-[0.625rem] tabular-nums"
							>{group.number}</span
						>
						Step {group.number}: {group.step.title}
					</p>
					<ul class="mt-3 space-y-2 border-l-4 border-dashed border-pixel pl-4 text-sm">
						{#each group.criteria as criterion (criterion.id)}
							<li class="flex gap-2">
								<CheckIcon class="shrink-0 text-secondary" aria-hidden="true" />
								<span>{criterion.text}</span>
							</li>
						{/each}
					</ul>
				</li>
			{/if}
		{/each}
	</ol>
</section>
