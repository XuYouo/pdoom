<script lang="ts">
	import { Progress } from '#shared/ui/8bit/index.js';
	import { cn } from '#shared/lib/utils.js';

	interface Props {
		/** Composite score, integer 0–100. */
		points: number;
		size?: 'sm' | 'lg';
		class?: string;
	}

	let { points, size = 'sm', class: className }: Props = $props();
</script>

<span class={cn('inline-flex items-center gap-3', className)}>
	<span
		class={cn(
			'text-right retro text-foreground tabular-nums',
			size === 'lg' ? 'w-12 text-lg' : 'w-8 text-xs'
		)}
		aria-hidden="true"
	>
		{points}
	</span>
	<!-- Each lit segment is a lit pixel block: a bright top edge and a dark base, so the bar reads
	as stacked cells, not a flat strip. The 1px gaps between segments come from Progress. -->
	<Progress
		variant="retro"
		value={points}
		segments={10}
		progressBg="bg-accent"
		class={cn(
			'[&_[data-slot=progress-indicator]>.bg-accent]:shadow-[inset_0_2px_0_rgb(255_255_255/0.45),inset_0_-2px_0_rgb(0_0_0/0.25)]',
			size === 'lg' ? 'h-5 w-40' : 'h-3 w-20'
		)}
		aria-label="Score {points} out of 100"
		aria-valuetext="{points} out of 100"
	/>
</span>
