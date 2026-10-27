<script lang="ts">
	import { resolve } from '$app/paths';
	import { ScoreMeter } from '#entities/generation/index.js';
	import { formatDate } from '#shared/lib/format.js';
	import type { CompareRun } from '../model/types';

	interface Props {
		run: CompareRun;
		/** An extra line, e.g. the animation's own length and the speed it plays at here. */
		note?: string;
		/** `end` mirrors the plate so a left/right pair faces each other on wide screens. */
		align?: 'start' | 'end';
	}

	let { run, note, align = 'start' }: Props = $props();
</script>

<div
	class={[
		'plate flex flex-wrap items-center justify-between gap-x-4 gap-y-3 p-4 text-sm',
		align === 'end' && 'md:flex-row-reverse md:text-right'
	]}
>
	<div class="min-w-0">
		<a
			href={resolve('/g/[id]', { id: run.id })}
			class="inline-flex min-h-11 items-center font-medium text-foreground hover:underline"
			>{run.modelLabel}</a
		>
		<span class="block text-muted-foreground">
			v{run.plugin} in {run.harness}, {formatDate(run.date)}{#if run.outdated}, unranked{/if}
		</span>
		{#if note}<span class="block text-muted-foreground">{note}</span>{/if}
	</div>
	{#if run.points !== null}
		<ScoreMeter points={run.points} />
	{/if}
</div>
