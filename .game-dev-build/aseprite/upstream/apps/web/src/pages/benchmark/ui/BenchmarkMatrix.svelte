<script lang="ts">
	import { resolve } from '$app/paths';
	import CheckIcon from '~icons/pixelarticons/check';
	import ChevronDownIcon from '~icons/pixelarticons/chevron-down';
	import CloseIcon from '~icons/pixelarticons/close';
	import { Badge, Button, Collapsible, Table } from '#shared/ui/8bit/index.js';
	import { plural } from '#shared/lib/format.js';
	import { ScoreMeter } from '#entities/generation/index.js';
	import type { BenchmarkView, CellView } from '#entities/benchmark/index.js';

	interface Props {
		benchmark: BenchmarkView;
	}

	let { benchmark }: Props = $props();

	const cellIndex = $derived(
		new Map(benchmark.cells.map((cell) => [`${cell.modelLabel}\u0000${cell.plugin}`, cell]))
	);
	const cellAt = (model: string, version: string): CellView | undefined =>
		cellIndex.get(`${model}\u0000${version}`);
	const breakdown = $derived(
		benchmark.models.flatMap((model) =>
			benchmark.versions.flatMap((version) => {
				const cell = cellAt(model, version);
				return cell ? [cell] : [];
			})
		)
	);
	let open = $state(false);
</script>

<section id="ranking" class="scroll-mt-24" aria-labelledby={`results-${benchmark.prompt.id}`}>
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h2 id={`results-${benchmark.prompt.id}`} class="section-title text-lg sm:text-2xl">
			Full ranking
		</h2>
		{#if benchmark.outdatedRuns.length > 0}
			<Badge variant="outline" class="text-[0.625rem]">
				{plural(benchmark.outdatedRuns.length, 'unranked run')} on older revisions
			</Badge>
		{/if}
	</div>
	{#if benchmark.cells.length === 0}
		<p class="mt-4 text-sm text-muted-foreground">
			No ranked runs on revision {benchmark.prompt.revision} yet. The maintainers run the benchmarks;
			new models are added as they are tested.
		</p>
	{:else}
		<p class="mt-4 text-sm text-muted-foreground">
			Rows are models, strongest first; columns are plugin versions, newest first. Each cell is the
			best run's score and its craft rating.
		</p>
		<div class="mt-5 overflow-x-auto px-2 pb-2">
			<Table.Root font="normal" containerClass="w-full min-w-max" class="text-sm">
				<caption class="sr-only"
					>Best score per model and plugin version for {benchmark.prompt.title}</caption
				>
				<Table.Header>
					<Table.Row>
						<Table.Head class="retro text-[0.625rem]">Model</Table.Head>
						{#each benchmark.versions as version (version)}
							<Table.Head class="retro text-[0.625rem]">v{version}</Table.Head>
						{/each}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each benchmark.models as model (model)}
						<Table.Row class="last:border-b-0 hover:bg-muted/60">
							<Table.Head scope="row" class="font-medium whitespace-normal text-foreground"
								>{model}</Table.Head
							>
							{#each benchmark.versions as version (version)}
								{@const cell = cellAt(model, version)}
								<Table.Cell class="py-3">
									{#if cell}
										<a
											href={resolve('/g/[id]', { id: cell.runs[0]!.id })}
											class="flex w-fit flex-col gap-1 hover:underline"
										>
											<ScoreMeter points={cell.points} />
											<span class="text-xs text-muted-foreground tabular-nums">
												{cell.best.passed}/{cell.best.total} criteria{#if cell.craft}, {Math.round(
														cell.craft.score * 100
													)}% craft ({plural(cell.craft.judges, 'judge')}){:else}, unrated{/if}
											</span>
											<span class="text-xs text-muted-foreground"
												>{plural(cell.runs.length, 'run')}</span
											>
										</a>
									{:else}
										<span class="text-muted-foreground" aria-label="No runs">—</span>
									{/if}
								</Table.Cell>
							{/each}
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>

		<Collapsible.Root bind:open class="mt-6">
			<Collapsible.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="outline" size="sm">
						<ChevronDownIcon
							class={['transition-transform', open && 'rotate-180']}
							aria-hidden="true"
						/>
						{open ? 'Hide' : 'Show'} each criterion
					</Button>
				{/snippet}
			</Collapsible.Trigger>
			<Collapsible.Content class="font-sans">
				<div class="mt-5 overflow-x-auto px-2 pb-2">
					<Table.Root font="normal" containerClass="w-full min-w-max" class="text-sm">
						<caption class="sr-only"
							>Pass or fail per criterion for the best run of each model and version</caption
						>
						<Table.Header>
							<Table.Row class="align-bottom">
								<Table.Head class="retro text-[0.625rem]">Criterion</Table.Head>
								{#each breakdown as cell (`${cell.modelLabel}@${cell.plugin}`)}
									<Table.Head class="h-auto py-2 whitespace-normal">
										{cell.modelLabel}
										<span class="block text-xs text-muted-foreground">v{cell.plugin}</span>
									</Table.Head>
								{/each}
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each benchmark.prompt.criteria as criterion (criterion.id)}
								<Table.Row class="last:border-b-0 hover:bg-muted/60">
									<Table.Head
										scope="row"
										class="h-auto max-w-[46ch] py-3 align-top font-normal whitespace-normal text-foreground"
									>
										{criterion.text}
									</Table.Head>
									{#each breakdown as cell (`${cell.modelLabel}@${cell.plugin}`)}
										{@const result = cell.bestResults.find((r) => r.criterion === criterion.id)}
										<Table.Cell class="py-3 align-top whitespace-normal">
											{#if result}
												<span
													class={[
														'inline-flex items-center gap-1 px-2 py-1 retro text-[0.625rem]',
														result.pass
															? 'bg-secondary text-secondary-foreground'
															: 'bg-pico-red text-black'
													]}
												>
													{#if result.pass}<CheckIcon aria-hidden="true" />Pass{:else}<CloseIcon
															aria-hidden="true"
														/>Fail{/if}
												</span>
												{#if result.note}<span
														class="mt-1.5 block max-w-40 text-xs text-muted-foreground"
														>{result.note}</span
													>{/if}
											{:else}
												<span class="text-muted-foreground">—</span>
											{/if}
										</Table.Cell>
									{/each}
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			</Collapsible.Content>
		</Collapsible.Root>
	{/if}

	{#if benchmark.outdatedRuns.length > 0}
		<div class="pixel-notch mt-8 border-6 border-dashed border-pixel p-4 [--notch:6px]">
			<h3 class="text-sm">Unranked: older revisions</h3>
			<p class="mt-1 text-sm text-muted-foreground">
				These ran an earlier revision. Listed so you can find them; not ranked.
			</p>
			<ul class="mt-3 space-y-2">
				{#each benchmark.outdatedRuns as run (run.id)}
					<li class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
						<Badge variant="outline" class="text-[0.625rem]">Unranked, rev. {run.revision}</Badge>
						<a href={resolve('/g/[id]', { id: run.id })} class="font-medium hover:underline"
							>{run.title}</a
						>
						<span class="text-muted-foreground">{run.modelLabel}, v{run.plugin}</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</section>
