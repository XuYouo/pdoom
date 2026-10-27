<script lang="ts">
	import TrendingUpIcon from '~icons/pixelarticons/trending-up';
	import { Card } from '#shared/ui/8bit/index.js';
	import { LineChart, type ChartSeries } from '#shared/ui/chart/index.js';
	import { formatDate } from '#shared/lib/format.js';
	import type { LeaderboardEntryView } from '#entities/benchmark/index.js';

	interface Props {
		leaderboard: LeaderboardEntryView[];
		/** How many benchmarks the suite has. */
		total: number;
	}

	let { leaderboard, total }: Props = $props();

	const series = $derived(
		leaderboard.map((entry, rank): ChartSeries => ({
			id: entry.modelLabel,
			label: entry.modelLabel,
			color: rank,
			// Only the days the model itself ran: on the others its score did not move, and the
			// chart's dashed stretches already carry it.
			points: entry.history
				.filter((snapshot) => snapshot.ran)
				.map((snapshot) => ({
					date: snapshot.date,
					y: snapshot.score,
					note: `${snapshot.benchmarks}/${total} benchmarks run`
				}))
		}))
	);
</script>

<div class="pt-16">
	<h3 id="leaderboard-history" class="section-title text-sm sm:text-lg">
		<span class="flex items-center gap-3"
			><TrendingUpIcon class="text-accent-ink" aria-hidden="true" />Score over time</span
		>
	</h3>
	<p class="mt-4 max-w-[70ch] text-sm text-muted-foreground">
		Each model's leaderboard score from the first run to today (a year at most). A marker is a day
		the model ran; the line is solid between runs and dashed where it did not run, carrying its
		nearest score. Benchmarks it had not run yet count 0, so a line climbs both when the model draws
		better and when it covers more of the suite.
	</p>
	<div class="mt-6 px-1.5">
		<Card font="normal" class="gap-0 py-0">
			<div class="px-3 pt-6 pb-5 sm:px-6">
				<LineChart
					{series}
					formatDay={formatDate}
					label="Leaderboard score out of 100 for each model, by day"
				/>
			</div>
		</Card>
	</div>
</div>
