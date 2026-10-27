<script lang="ts">
	import CheckIcon from '~icons/pixelarticons/check';
	import CloseIcon from '~icons/pixelarticons/close';

	interface Props {
		reports: { step: number; passed: boolean; score?: number; errors: number; warnings: number }[];
	}

	let { reports }: Props = $props();
</script>

{#if reports.length > 0}
	<section aria-labelledby="validate">
		<h2 id="validate" class="section-title text-base sm:text-xl">Validate reports</h2>
		<p class="mt-4 text-sm text-muted-foreground">
			What the plugin's own lint said at the end of each step.
		</p>
		<ul class="mt-6 space-y-3">
			{#each reports as report, i (i)}
				<li
					class={[
						'flex flex-wrap items-center gap-x-4 gap-y-1 border-l-4 bg-muted/40 py-3 pr-4 pl-4 text-sm',
						report.passed ? 'border-secondary' : 'border-pico-red'
					]}
				>
					<span class="retro text-[0.625rem]">Step {report.step}</span>
					<span
						class={[
							'inline-flex items-center gap-1 font-medium',
							report.passed ? '' : 'text-destructive'
						]}
					>
						{#if report.passed}<CheckIcon
								class="size-4"
								aria-hidden="true"
							/>Passed{:else}<CloseIcon class="size-4" aria-hidden="true" />Failed{/if}
					</span>
					{#if report.score !== undefined}<span class="tabular-nums">Score {report.score}</span
						>{/if}
					<span class="text-muted-foreground tabular-nums">
						{report.errors}
						{report.errors === 1 ? 'error' : 'errors'}, {report.warnings}
						{report.warnings === 1 ? 'warning' : 'warnings'}
					</span>
				</li>
			{/each}
		</ul>
	</section>
{/if}
