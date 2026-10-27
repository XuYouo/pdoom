<script lang="ts">
	import { Seo } from '#shared/ui/seo/index.js';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import ArrowLeftIcon from '~icons/pixelarticons/arrow-left';
	import PauseIcon from '~icons/pixelarticons/pause';
	import PlayIcon from '~icons/pixelarticons/play';
	import ReloadIcon from '~icons/pixelarticons/reload';
	import { Button, Checkbox, Select, Slider, ToggleGroup } from '#shared/ui/8bit/index.js';
	import { formatDate } from '#shared/lib/format.js';
	import { Lightbox } from '#shared/ui/lightbox/index.js';
	import { Playback } from '../model/playback.svelte';
	import type { BenchmarkComparePageData, CompareRun } from '../model/types';
	import ArtTile from './ArtTile.svelte';
	import CompareSlider from './CompareSlider.svelte';
	import FilmstripRows from './FilmstripRows.svelte';
	import RunCaption from './RunCaption.svelte';

	interface Props {
		data: BenchmarkComparePageData;
	}

	let { data }: Props = $props();

	type Mode = 'slider' | 'grid';

	const { prompt, views, runs } = $derived(data);
	const path = $derived(resolve('/benchmarks/[prompt]/compare', { prompt: prompt.id }));

	let mode = $state<Mode>('slider');
	let viewKey = $state('');
	let beforeId = $state('');
	let afterId = $state('');
	/** Runs shown in the grid, in the order they were picked. */
	let picked = $state<string[]>([]);

	const playback = new Playback();
	/** Divider position, shared by the slider and its full-screen view. */
	let divider = $state(50);
	let sliderZoomed = $state(false);

	// Initial picks before onMount reads the URL: the last step's animation (the finished
	// result), the two newest runs side by side, every run in the grid.
	const view = $derived(
		views.find((candidate) => candidate.key === viewKey) ??
			views.findLast((candidate) => candidate.key.endsWith('-animation')) ??
			views.at(-1)
	);
	const animated = $derived(view?.key.endsWith('-animation') ?? false);
	const filmstrip = $derived(view?.key.endsWith('-filmstrip') ?? false);
	const before = $derived(runs.find((run) => run.id === beforeId) ?? runs[1] ?? runs[0]);
	const after = $derived(runs.find((run) => run.id === afterId) ?? runs[0]);
	const gridRuns = $derived(
		picked.length > 0 ? runs.filter((run) => picked.includes(run.id)) : runs
	);

	const runLabel = (run: CompareRun) =>
		`${run.modelLabel} · v${run.plugin} · ${formatDate(run.date)}`;

	/** "4.9 s, played at 0.42×" once the run's animation has decoded. */
	function tempo(run: CompareRun): string | undefined {
		const file = view && animated ? run.images[view.key] : undefined;
		const duration = file ? playback.durations[file.url] : undefined;
		if (!duration) return undefined;
		return `${(duration / 1000).toFixed(1)} s loop, played at ${playback.speed(duration).toFixed(2)}×`;
	}

	onMount(() => {
		const params = new URLSearchParams(location.search);
		const ids = new Set(runs.map((run) => run.id));
		if (params.get('mode') === 'grid') mode = 'grid';
		const v = params.get('view');
		if (v && views.some((candidate) => candidate.key === v)) viewKey = v;
		const a = params.get('a');
		if (a && ids.has(a)) beforeId = a;
		const b = params.get('b');
		if (b && ids.has(b)) afterId = b;
		picked = (params.get('runs') ?? '').split(',').filter((id) => ids.has(id));

		// Reduced motion holds the first frame; the scrubber still steps through by hand.
		if (!prefersReducedMotion.current) playback.play();
		return () => playback.pause();
	});

	function syncUrl() {
		const params = new URLSearchParams();
		if (mode === 'grid') params.set('mode', 'grid');
		if (view) params.set('view', view.key);
		if (mode === 'slider') {
			if (before) params.set('a', before.id);
			if (after) params.set('b', after.id);
		} else if (picked.length > 0) {
			params.set('runs', picked.join(','));
		}
		// svelte/no-navigation-without-resolve: `path` is already resolve()d.
		const query = params.toString();
		goto(query ? `${path}?${query}` : path, { shallow: true, replace: true });
	}

	function toggle(id: string) {
		const current = picked.length > 0 ? picked : runs.map((run) => run.id);
		const next = current.includes(id)
			? current.filter((candidate) => candidate !== id)
			: [...current, id];
		// An empty pick would show every run again, which reads as the click doing nothing.
		if (next.length === 0) return;
		picked = next.length === runs.length ? [] : next;
		syncUrl();
	}
</script>

<Seo
	title="Compare runs: {prompt.title}"
	description="Compare runs of the {prompt.title} pixel-art benchmark side by side, model against model."
/>

{#snippet runSelect(
	id: string,
	label: string,
	value: CompareRun | undefined,
	set: (id: string) => void
)}
	<div class="min-w-0">
		<span id="label-{id}" class="mb-3 block retro text-[0.625rem]">{label}</span>
		<Select.Root type="single" value={value?.id ?? ''} onValueChange={(next) => next && set(next)}>
			<Select.Trigger {id} aria-labelledby="label-{id} {id}" font="normal" class="w-full text-sm">
				{value ? runLabel(value) : 'Pick a run'}
			</Select.Trigger>
			<Select.Content font="normal">
				{#each runs as run (run.id)}
					<Select.Item value={run.id} label={runLabel(run)} class="text-sm"
						>{runLabel(run)}</Select.Item
					>
				{/each}
			</Select.Content>
		</Select.Root>
	</div>
{/snippet}

<header class="page-hero mx-auto max-w-6xl px-4 pt-10 sm:px-6 sm:pt-14">
	<a
		href={resolve('/benchmarks/[prompt]', { prompt: prompt.id })}
		class="inline-flex h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
	>
		<ArrowLeftIcon aria-hidden="true" />
		{prompt.title}
	</a>

	<p class="eyebrow mt-4">Compare runs</p>
	<h1 class="title-depth mt-5 text-2xl leading-snug sm:text-4xl sm:leading-snug">Compare runs</h1>
</header>

<div class="mx-auto max-w-6xl px-4 sm:px-6">
	{#if runs.length < 2 || !view}
		<p class="plate mt-8 max-w-xl p-5 text-muted-foreground">
			This benchmark needs at least two runs before there is anything to compare.
		</p>
	{:else}
		<!-- The control deck: what to look at (mode, image), how it plays, and which runs. -->
		<div class="plate mt-8 space-y-6 p-5 sm:p-6">
			<div class="flex flex-wrap items-start gap-x-8 gap-y-6">
				<div>
					<span id="label-mode" class="mb-3 block retro text-[0.625rem]">Mode</span>

					<!-- One mode is always on: an empty value (the pressed item clicked again) is ignored. -->
					<ToggleGroup.Root
						aria-labelledby="label-mode"
						class="px-0"
						bind:value={
							() => mode,
							(next) => {
								if (next === 'slider' || next === 'grid') {
									mode = next;
									syncUrl();
								}
							}
						}
					>
						<ToggleGroup.Item value="slider">{filmstrip ? 'Two runs' : 'Slider'}</ToggleGroup.Item>
						<ToggleGroup.Item value="grid">{filmstrip ? 'Many runs' : 'Grid'}</ToggleGroup.Item>
					</ToggleGroup.Root>
				</div>
				<div class="min-w-64 flex-1">
					<span id="label-view" class="mb-3 block retro text-[0.625rem]">Image</span>

					<Select.Root
						type="single"
						value={view.key}
						onValueChange={(next) => next && ((viewKey = next), syncUrl())}
					>
						<Select.Trigger
							id="view"
							aria-labelledby="label-view view"
							font="normal"
							class="w-full text-sm">{view.label}</Select.Trigger
						>

						<Select.Content font="normal">
							{#each views as candidate (candidate.key)}
								<Select.Item value={candidate.key} label={candidate.label} class="text-sm"
									>{candidate.label}</Select.Item
								>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			</div>

			{#if animated}
				<div class="pixel-rule opacity-40"></div>
				<div class="flex flex-wrap items-center gap-x-6 gap-y-4">
					<Button
						variant="outline"
						size="icon"
						aria-label={playback.playing ? 'Pause' : 'Play'}
						onclick={() => (playback.playing ? playback.pause() : playback.play())}
					>
						{#if playback.playing}<PauseIcon aria-hidden="true" />{:else}<PlayIcon
								aria-hidden="true"
							/>{/if}
					</Button>
					<Button
						variant="outline"
						size="icon"
						aria-label="Restart from the first frame"
						onclick={() => playback.restart()}
					>
						<ReloadIcon aria-hidden="true" />
					</Button>
					<!-- Grabbing the scrubber pauses the clock; while paused, every value change is the user's.
					While playing, bits-ui echoes the clock's own updates (rounded to `step`) through
					onValueChange, and those must not be mistaken for a scrub. -->
					<div
						class="flex min-w-48 flex-1 items-center gap-4 text-sm"
						role="presentation"
						onpointerdowncapture={() => playback.pause()}
						onkeydowncapture={(event) => {
							// Only keys that move the thumb: Tab out of the scrubber must not stop playback.
							if (
								[
									'ArrowLeft',
									'ArrowRight',
									'ArrowUp',
									'ArrowDown',
									'Home',
									'End',
									'PageUp',
									'PageDown'
								].includes(event.key)
							)
								playback.pause();
						}}
					>
						<span class="shrink-0 retro text-xs text-accent-ink tabular-nums"
							>{((playback.position * playback.cycle) / 1000).toFixed(1)} s</span
						>

						<!-- Whole thousandths, not a 0–1 float: bits-ui snaps the value to `step`, and a float
						snapped and fed back can flip between two neighbouring doubles forever. -->
						<Slider
							value={Math.round(playback.position * 1000)}
							min={0}
							max={1000}
							step={10}
							label="Playback position"
							valueText="{Math.round(playback.position * 100)}% through the loop"
							onValueChange={(next) => {
								if (!playback.playing) playback.seek(next / 1000);
							}}
						/>
					</div>
					<p class="w-full text-sm text-muted-foreground">
						Every animation is stretched to the longest loop ({(playback.cycle / 1000).toFixed(1)} s),
						so all of them start and end together.
					</p>
				</div>
			{/if}

			<div class="pixel-rule opacity-40"></div>
			{#if mode === 'slider'}
				<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
					{@render runSelect(
						'before',
						filmstrip ? 'First' : 'Left',
						before,
						(id) => ((beforeId = id), syncUrl())
					)}
					{@render runSelect(
						'after',
						filmstrip ? 'Second' : 'Right',
						after,
						(id) => ((afterId = id), syncUrl())
					)}
				</div>
			{:else}
				<fieldset>
					<legend class="mb-3 block retro text-[0.625rem]">Runs</legend>
					<div class="flex flex-wrap gap-x-6 gap-y-1">
						{#each runs as run (run.id)}
							<label class="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
								<Checkbox
									checked={gridRuns.includes(run)}
									// At least one run stays picked: an empty pick would show every run again.
									disabled={// At least one run stays picked: an empty pick would show every run again.
									gridRuns.length === 1 && gridRuns.includes(run)}
									onCheckedChange={() => toggle(run.id)}
								/>

								{runLabel(run)}
							</label>
						{/each}
					</div>
				</fieldset>
			{/if}
		</div>
	{/if}
</div>

{#if runs.length >= 2 && view}
	{#if filmstrip}
		<!-- A filmstrip is too long to overlay: every run gets its own row, at the full screen width. -->
		<div class="mt-10">
			<FilmstripRows
				runs={mode === 'slider' ? [before, after].filter((run) => run !== undefined) : gridRuns}
				viewKey={view.key}
				label={runLabel}
			/>
		</div>
	{:else}
		<div class="mx-auto max-w-6xl px-4 sm:px-6">
			{#if mode === 'slider'}
				<div class="mt-12">
					{#if before && after && before.images[view.key] && after.images[view.key]}
						<CompareSlider
							before={{ file: before.images[view.key], label: runLabel(before) }}
							after={{ file: after.images[view.key], label: runLabel(after) }}
							{playback}
							bind:position={divider}
							onexpand={() => (sliderZoomed = true)}
						/>
						<Lightbox
							bind:open={sliderZoomed}
							label="Compare {runLabel(before)} and {runLabel(after)}"
						>
							{#snippet children(box)}
								<CompareSlider
									before={{ file: before.images[view.key], label: runLabel(before) }}
									after={{ file: after.images[view.key], label: runLabel(after) }}
									{playback}
									bind:position={divider}
									{box}
								/>
							{/snippet}
						</Lightbox>
						<div class="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
							<RunCaption run={before} note={tempo(before)} />
							<RunCaption run={after} note={tempo(after)} align="end" />
						</div>
					{:else}
						<p class="plate p-5 text-muted-foreground">
							{[before, after]
								.filter((run) => run && !run.images[view.key])
								.map((run) => runLabel(run!))
								.join(' and ')}
							{[before, after].filter((run) => run && !run.images[view.key]).length > 1
								? 'have'
								: 'has'} no {view.label}. Pick another image or run.
						</p>
					{/if}
				</div>
			{:else}
				<ul
					class={[
						'mt-12 grid grid-cols-1 gap-x-8 gap-y-12 px-1.5',
						gridRuns.length > 1 && 'md:grid-cols-2',
						gridRuns.length > 2 && 'xl:grid-cols-3'
					]}
				>
					{#each gridRuns as run (run.id)}
						<li class="space-y-4">
							<div
								class="pixel-frame canvas-checker grid min-h-40 place-items-center overflow-hidden"
							>
								{#if run.images[view.key]}
									<ArtTile file={run.images[view.key]} alt={runLabel(run)} {playback} />
								{:else}
									<p class="bg-background/85 px-2 py-1 text-sm text-muted-foreground">
										No {view.label} in this run
									</p>
								{/if}
							</div>
							<RunCaption {run} note={tempo(run)} />
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
{/if}
