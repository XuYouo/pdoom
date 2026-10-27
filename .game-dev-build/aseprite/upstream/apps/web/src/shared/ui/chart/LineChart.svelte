<script lang="ts">
	import { cn } from '#shared/lib/utils.js';
	import type { ChartPoint, ChartSeries } from './types';

	interface Props {
		series: ChartSeries[];
		/** What the chart shows, for screen readers; the data itself is in a hidden table. */
		label: string;
		/** Turns a day into the tooltip heading and the hidden table's column header. */
		formatDay: (iso: string) => string;
		/** The furthest the axis reaches back from today; shorter histories get a tighter window. */
		maxWeeks?: number;
		yMax?: number;
		yTicks?: number[];
		height?: number;
		class?: string;
	}

	let {
		series,
		label,
		formatDay,
		maxWeeks = 52,
		yMax = 100,
		yTicks = [0, 25, 50, 75, 100],
		height = 280,
		class: className
	}: Props = $props();

	const DAY = 86_400_000;
	const WEEK = 7 * DAY;
	/** Two runs further apart than this have no data between them, so the segment is dashed. */
	const GAP = WEEK;

	/** Brightest first, so the first slots — the leaders, when slots follow a ranking — stand out. */
	const PALETTE = ['--chart-3', '--chart-5', '--chart-4', '--chart-2', '--chart-1'];
	const SHAPES = ['square', 'diamond', 'triangle', 'circle', 'ring'] as const;
	const colorOf = (slot: number) => `var(${PALETTE[slot % PALETTE.length]})`;
	/** Past the palette, the shape shifts so no two of the first 25 slots look alike. */
	const shapeOf = (slot: number) =>
		SHAPES[(slot + Math.floor(slot / PALETTE.length)) % SHAPES.length]!;

	const PAD = { top: 18, right: 18, bottom: 34, left: 40 };
	/** Narrowest gap between two axis labels; closer ones are dropped. */
	const LABEL_GAP = 56;
	/** How close the pointer must come to a run day to show it. */
	const SNAP = 28;
	/** The shortest window, so a handful of runs on one day still spreads out. */
	const MIN_SPAN = 7 * DAY;

	const dayOf = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
	/** Runs sit mid-day, inside their day's column on a daily axis. */
	const at = (iso: string) => dayOf(iso) + DAY / 2;

	const times = $derived(series.flatMap((entry) => entry.points.map((point) => at(point.date))));
	/** The axis ends today, or on the latest run if the clock is behind the data. */
	const end = $derived(Math.max(Date.now(), ...times.map((time) => time + DAY / 2)));
	/**
	 * The axis starts a little before the oldest run, so the window fits the data, but never
	 * reaches back further than `maxWeeks`.
	 */
	const start = $derived.by(() => {
		const oldest = Math.min(end, ...times);
		const margin = Math.max(DAY, (end - oldest) * 0.06);
		return Math.max(end - maxWeeks * WEEK, Math.min(oldest - margin, end - MIN_SPAN));
	});
	const visible = (iso: string) => at(iso) >= start;

	let width = $state(0);
	/** The run day under the pointer or the keyboard cursor. */
	let activeDay = $state<string | null>(null);
	/** The series picked in the legend, drawn over the others. */
	let pinned = $state<string | null>(null);
	let hovered = $state<string | null>(null);
	const highlighted = $derived(hovered ?? pinned);

	const plotWidth = $derived(Math.max(0, width - PAD.left - PAD.right));
	const plotHeight = $derived(height - PAD.top - PAD.bottom);
	const xAt = (time: number) => PAD.left + ((time - start) / (end - start)) * plotWidth;
	const yAt = (value: number) => PAD.top + plotHeight * (1 - Math.min(value, yMax) / yMax);

	const dayFormat = new Intl.DateTimeFormat('en', {
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});
	const monthFormat = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' });
	const midnight = (time: number) => {
		const date = new Date(time);
		return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
	};

	/**
	 * Gridlines and labels at the finest step that fits the window: days up to a month, weeks
	 * (from Monday) up to four months, then weekly gridlines under month labels.
	 */
	const axis = $derived.by(() => {
		const span = end - start;
		const lines: number[] = [];
		const labels: { time: number; text: string }[] = [];
		if (span <= 31 * DAY) {
			for (let time = midnight(start) + DAY; time <= end; time += DAY) lines.push(time);
			for (let time = midnight(start); time <= end; time += DAY) {
				if (time + DAY / 2 >= start && time + DAY / 2 <= end)
					labels.push({ time: time + DAY / 2, text: dayFormat.format(time) });
			}
		} else {
			const first = new Date(midnight(start));
			const monday = first.getTime() + ((8 - first.getUTCDay()) % 7) * DAY;
			for (let time = monday; time <= end; time += WEEK) lines.push(time);
			if (span <= 120 * DAY) {
				for (const time of lines) labels.push({ time, text: dayFormat.format(time) });
			} else {
				let time = Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1);
				while (time <= end) {
					const date = new Date(time);
					const month = monthFormat.format(date);
					// January carries the year so the axis says where it turns.
					labels.push({
						time,
						text: date.getUTCMonth() === 0 ? `${month} ${date.getUTCFullYear()}` : month
					});
					time = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
				}
			}
		}
		const kept: typeof labels = [];
		for (const label of labels) {
			const last = kept.at(-1);
			if (!last || xAt(label.time) - xAt(last.time) >= LABEL_GAP) kept.push(label);
		}
		return { lines, labels: kept };
	});

	const sorted = $derived(
		series.map((entry) => ({
			...entry,
			points: [...entry.points].sort((a, b) => a.date.localeCompare(b.date))
		}))
	);
	/** The highlighted series last, so it draws on top. */
	const drawOrder = $derived(
		[...sorted].sort((a, b) => Number(a.id === highlighted) - Number(b.id === highlighted))
	);
	/** Days with at least one run inside the window, oldest first: where the cursor can stop. */
	const runDays = $derived(
		[...new Set(sorted.flatMap((entry) => entry.points.map((point) => point.date)))]
			.filter(visible)
			.sort()
	);

	/**
	 * Solid between runs at most a week apart; dashed across a longer gap, from the left edge to
	 * the first run and from the last run to today — the stretches with no measurement, where the
	 * line only carries the nearest value.
	 */
	function segmentsOf(points: ChartPoint[]): { solid: string; dashed: string } {
		const first = points[0];
		const last = points.at(-1);
		if (!first || !last) return { solid: '', dashed: '' };
		const point = (time: number, y: number) => `${xAt(time)},${yAt(y)}`;
		const solid: string[] = [];
		const dashed: string[] = [
			`M${point(start, first.y)} L${point(at(first.date), first.y)}`,
			`M${point(at(last.date), last.y)} L${point(end, last.y)}`
		];
		for (let index = 1; index < points.length; index++) {
			const from = points[index - 1]!;
			const to = points[index]!;
			const segment = `M${point(at(from.date), from.y)} L${point(at(to.date), to.y)}`;
			(at(to.date) - at(from.date) > GAP ? dashed : solid).push(segment);
		}
		return { solid: solid.join(' '), dashed: dashed.join(' ') };
	}

	const round = (value: number) => Math.round(value);
	const signed = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${-value}` : '±0');

	/** Every run on one day, each with its change from the same series' run before it. */
	function rowsAt(day: string) {
		return sorted
			.flatMap((entry) =>
				entry.points.flatMap((point, index) =>
					point.date === day
						? [
								{
									entry,
									point,
									change: index === 0 ? null : round(point.y) - round(entry.points[index - 1]!.y)
								}
							]
						: []
				)
			)
			.sort((a, b) => b.point.y - a.point.y || a.entry.label.localeCompare(b.entry.label));
	}

	const tooltipRows = $derived(activeDay === null ? [] : rowsAt(activeDay));
	/** What a screen reader announces as the arrow keys move from run day to run day. */
	const valueText = $derived.by(() => {
		const day = activeDay ?? runDays.at(-1);
		if (day === undefined) return 'No runs';
		const rows = rowsAt(day).map(
			({ entry, point, change }) =>
				`${entry.label} ${round(point.y)}${change === null ? '' : ` (${signed(change)})`}`
		);
		return `${formatDay(day)}: ${rows.join(', ')}`;
	});

	function pick(event: PointerEvent) {
		// The hit area starts at the plot's left edge, not the SVG's.
		const bounds = (event.currentTarget as Element).getBoundingClientRect();
		const pointer = event.clientX - bounds.left + PAD.left;
		let nearest: string | null = null;
		let distance = SNAP;
		for (const day of runDays) {
			const away = Math.abs(xAt(at(day)) - pointer);
			if (away <= distance) {
				nearest = day;
				distance = away;
			}
		}
		activeDay = nearest;
	}

	function onkeydown(event: KeyboardEvent) {
		if (runDays.length === 0) return;
		const last = runDays.length - 1;
		const index = activeDay === null ? last : runDays.indexOf(activeDay);
		const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };
		if (event.key in moves) {
			event.preventDefault();
			activeDay = runDays[Math.min(last, Math.max(0, index + moves[event.key]!))]!;
		} else if (event.key === 'Home' || event.key === 'End') {
			event.preventDefault();
			activeDay = runDays[event.key === 'Home' ? 0 : last]!;
		} else if (event.key === 'Escape') {
			activeDay = null;
		}
	}

	/** Tooltip sits beside the cursor line, flipping left past the middle so it stays inside. */
	const tooltipLeft = $derived(activeDay === null ? 0 : xAt(at(activeDay)));
	const tooltipFlipped = $derived(tooltipLeft > width / 2);

	function summary(points: ChartPoint[]): { text: string; change: number | null } {
		const first = points[0];
		const last = points.at(-1);
		if (!first || !last) return { text: '—', change: null };
		if (points.length === 1) return { text: `${round(first.y)}`, change: null };
		return { text: `${round(first.y)} → ${round(last.y)}`, change: round(last.y) - round(first.y) };
	}

	const clipId = $props.id();
</script>

{#snippet marker(slot: number, cx: number, cy: number, size = 1)}
	{@const fill = colorOf(slot)}
	{@const r = 5 * size}
	{#if shapeOf(slot) === 'square'}
		<rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} {fill} />
	{:else if shapeOf(slot) === 'diamond'}
		<polygon
			points="{cx},{cy - r - 1.5} {cx + r + 1.5},{cy} {cx},{cy + r + 1.5} {cx - r - 1.5},{cy}"
			{fill}
		/>
	{:else if shapeOf(slot) === 'triangle'}
		<polygon points="{cx},{cy - r - 1.5} {cx + r + 1.5},{cy + r} {cx - r - 1.5},{cy + r}" {fill} />
	{:else if shapeOf(slot) === 'circle'}
		<circle {cx} {cy} r={r + 0.5} {fill} />
	{:else}
		<rect
			x={cx - r + 1.5}
			y={cy - r + 1.5}
			width={r * 2 - 3}
			height={r * 2 - 3}
			fill="var(--card)"
			stroke={fill}
			stroke-width="3"
			paint-order="fill"
		/>
	{/if}
{/snippet}

<figure class={cn('relative', className)}>
	<div
		class="relative outline-offset-4"
		style:height="{height}px"
		bind:clientWidth={width}
		role="slider"
		aria-roledescription="chart"
		aria-label="{label}. Arrow keys step from run to run."
		aria-orientation="horizontal"
		aria-valuemin={0}
		aria-valuemax={Math.max(0, runDays.length - 1)}
		aria-valuenow={activeDay === null
			? Math.max(0, runDays.length - 1)
			: runDays.indexOf(activeDay)}
		aria-valuetext={valueText}
		tabindex="0"
		{onkeydown}
		onfocus={() => (activeDay ??= runDays.at(-1) ?? null)}
		onblur={() => (activeDay = null)}
	>
		{#if width > 0}
			<svg {width} {height} class="block overflow-visible" aria-hidden="true">
				<defs>
					<clipPath id={clipId}>
						<rect x={PAD.left} y={0} width={plotWidth} {height} />
					</clipPath>
				</defs>

				{#each axis.lines as time (time)}
					<line
						x1={xAt(time)}
						x2={xAt(time)}
						y1={PAD.top}
						y2={yAt(0)}
						class="stroke-border/60"
						stroke-width="1"
						shape-rendering="crispEdges"
					/>
				{/each}

				{#each yTicks as tick (tick)}
					<line
						x1={PAD.left}
						x2={width - PAD.right}
						y1={yAt(tick)}
						y2={yAt(tick)}
						class={tick === 0 ? 'stroke-pixel' : 'stroke-border'}
						stroke-width={tick === 0 ? 3 : 2}
						stroke-dasharray={tick === 0 ? undefined : '4 6'}
						shape-rendering="crispEdges"
					/>
					<text
						x={PAD.left - 10}
						y={yAt(tick)}
						text-anchor="end"
						dominant-baseline="central"
						class="fill-muted-foreground retro text-[0.5rem]">{tick}</text
					>
				{/each}

				{#each axis.labels as tick (tick.time)}
					<line
						x1={xAt(tick.time)}
						x2={xAt(tick.time)}
						y1={yAt(0)}
						y2={yAt(0) + 6}
						class="stroke-pixel"
						stroke-width="2"
						shape-rendering="crispEdges"
					/>
					<text
						x={xAt(tick.time)}
						y={height - PAD.bottom + 22}
						text-anchor="middle"
						class="fill-muted-foreground retro text-[0.5rem]">{tick.text}</text
					>
				{/each}

				{#if activeDay !== null}
					<line
						x1={xAt(at(activeDay))}
						x2={xAt(at(activeDay))}
						y1={PAD.top - 8}
						y2={yAt(0)}
						class="stroke-foreground/35"
						stroke-width="2"
						stroke-dasharray="2 4"
						shape-rendering="crispEdges"
					/>
				{/if}

				<!-- Lines are clipped to the plot; markers are not, so a run today is not cut in half. -->
				<g>
					{#each drawOrder as entry (entry.id)}
						{@const dim = highlighted !== null && highlighted !== entry.id}
						{@const path = segmentsOf(entry.points)}
						{@const strong = highlighted === entry.id}
						<g class={cn('transition-opacity duration-200', dim && 'opacity-20')}>
							<g clip-path="url(#{clipId})">
								<path
									d={path.dashed}
									fill="none"
									stroke={colorOf(entry.color)}
									stroke-width={strong ? 3 : 2}
									stroke-dasharray="4 5"
									class="opacity-70"
								/>
								{#if path.solid}
									<!-- A halo in the card colour first, so a line crossing another stays readable. -->
									<path d={path.solid} fill="none" stroke="var(--card)" stroke-width="7" />
									<path
										d={path.solid}
										fill="none"
										stroke={colorOf(entry.color)}
										stroke-width={strong ? 4 : 3}
										stroke-linecap="square"
										stroke-linejoin="miter"
									/>
								{/if}
							</g>
							{#each entry.points as point, index (index)}
								{#if visible(point.date)}
									<g stroke="var(--card)" stroke-width="2.5" paint-order="stroke">
										{@render marker(
											entry.color,
											xAt(at(point.date)),
											yAt(point.y),
											activeDay === point.date ? 1.3 : 1
										)}
									</g>
								{/if}
							{/each}
						</g>
					{/each}
				</g>

				<rect
					x={PAD.left}
					y={0}
					width={plotWidth}
					height={height - PAD.bottom + 28}
					fill="transparent"
					class="cursor-crosshair"
					role="presentation"
					onpointermove={pick}
					onpointerdown={pick}
					onpointerleave={() => (activeDay = null)}
				/>
			</svg>

			{#if activeDay !== null && tooltipRows.length > 0}
				<div
					class={cn(
						'pointer-events-none absolute z-10 w-max max-w-64 border-4 border-pixel bg-popover px-3 py-2 text-popover-foreground shadow-[4px_4px_0_0_var(--pixel)]',
						tooltipFlipped && '-translate-x-full'
					)}
					style:left="{tooltipLeft + (tooltipFlipped ? -14 : 14)}px"
					style:top="{PAD.top}px"
				>
					<p class="retro text-[0.5rem] text-muted-foreground">{formatDay(activeDay)}</p>
					<ul class="mt-2 grid gap-1.5">
						{#each tooltipRows as row, index (index)}
							<li class="grid grid-cols-[14px_1fr_auto] items-baseline gap-x-2 text-sm">
								<svg
									width="14"
									height="14"
									viewBox="0 0 14 14"
									class="self-center"
									aria-hidden="true"
								>
									{@render marker(row.entry.color, 7, 7, 0.9)}
								</svg>
								<span class="truncate">{row.entry.label}</span>
								<span class="text-right retro text-xs tabular-nums"
									>{round(row.point.y)}{#if row.change !== null}<span
											class={cn(
												'ml-1.5 text-[0.5rem]',
												row.change > 0 && 'text-secondary dark:text-pico-green',
												row.change < 0 && 'text-destructive',
												row.change === 0 && 'text-muted-foreground'
											)}>{signed(row.change)}</span
										>{/if}</span
								>
								{#if row.point.note}
									<span class="col-start-2 col-end-4 -mt-1 text-xs text-muted-foreground"
										>{row.point.note}</span
									>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		{/if}
	</div>

	<table class="sr-only">
		<caption>{label}</caption>
		<thead>
			<tr>
				<th scope="col">Series</th>
				{#each runDays as day (day)}
					<th scope="col">{formatDay(day)}</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each sorted as entry (entry.id)}
				<tr>
					<th scope="row">{entry.label}</th>
					{#each runDays as day (day)}
						<td
							>{entry.points
								.filter((point) => point.date === day)
								.map((point) => round(point.y))
								.join(', ') || '—'}</td
						>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>

	<figcaption class="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
		<ul class="flex flex-wrap gap-2" aria-label="Legend">
			{#each sorted as entry (entry.id)}
				{@const total = summary(entry.points)}
				<li>
					<button
						type="button"
						class={cn(
							'pixel-notch flex items-center gap-2 border-4 px-2.5 py-1 text-sm transition-[opacity,border-color] [--notch:4px]',
							pinned === entry.id ? 'border-pixel bg-muted' : 'border-transparent hover:bg-muted',
							highlighted !== null && highlighted !== entry.id && 'opacity-50'
						)}
						aria-pressed={pinned === entry.id}
						onclick={() => (pinned = pinned === entry.id ? null : entry.id)}
						onpointerenter={() => (hovered = entry.id)}
						onpointerleave={() => (hovered = null)}
						onfocus={() => (hovered = entry.id)}
						onblur={() => (hovered = null)}
					>
						<svg width="26" height="14" viewBox="0 0 26 14" aria-hidden="true">
							<line x1="1" x2="25" y1="7" y2="7" stroke={colorOf(entry.color)} stroke-width="3" />
							<g stroke="var(--card)" stroke-width="2" paint-order="stroke">
								{@render marker(entry.color, 13, 7, 0.9)}
							</g>
						</svg>
						<span>{entry.label}</span>
						<span class="retro text-[0.5rem] text-muted-foreground tabular-nums">{total.text}</span>
						{#if total.change !== null}
							<span
								class={cn(
									'retro text-[0.5rem] tabular-nums',
									total.change > 0 && 'text-secondary dark:text-pico-green',
									total.change < 0 && 'text-destructive',
									total.change === 0 && 'text-muted-foreground'
								)}>{signed(total.change)}</span
							>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
		<p class="flex items-center gap-4 text-xs text-muted-foreground" aria-hidden="true">
			<span class="flex items-center gap-2">
				<svg width="22" height="6" viewBox="0 0 22 6"
					><line
						x1="0"
						x2="22"
						y1="3"
						y2="3"
						class="stroke-muted-foreground"
						stroke-width="3"
					/></svg
				>runs
			</span>
			<span class="flex items-center gap-2">
				<svg width="22" height="6" viewBox="0 0 22 6"
					><line
						x1="0"
						x2="22"
						y1="3"
						y2="3"
						class="stroke-muted-foreground"
						stroke-width="2"
						stroke-dasharray="4 5"
					/></svg
				>no runs
			</span>
		</p>
	</figcaption>
</figure>
