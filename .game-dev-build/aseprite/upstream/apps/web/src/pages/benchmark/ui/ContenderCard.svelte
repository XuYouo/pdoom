<script lang="ts">
	import { resolve } from '$app/paths';
	import TrophyIcon from '~icons/pixelarticons/trophy';
	import { FileImage, ScoreMeter } from '#entities/generation/index.js';
	import type { ContenderView } from '../model/types';

	interface Props {
		contender: ContenderView;
		/** 1 for the strongest model. */
		place: number;
		/** The winner gets the big frame; everyone else a smaller one beside it. */
		lead?: boolean;
	}

	let { contender, place, lead = false }: Props = $props();

	const PLACES = ['1st', '2nd', '3rd'];
	const placeLabel = $derived(PLACES[place - 1] ?? `${place}th`);
	const cover = $derived(contender.run.cover);
	const alt = $derived(`${contender.run.title}, drawn by ${contender.modelLabel}`);
</script>

<div class="h-full">
	<article
		class="pixel-frame relative isolate flex h-full flex-col gap-2 overflow-hidden bg-card p-2 shadow-[inset_0_0_0_2px_rgb(255_255_255/0.1)]"
	>
		<!-- The piece's own colours, blurred, glow through the frame, as on the gallery cards. Decorative. -->
		<img
			src={cover.url}
			alt=""
			aria-hidden="true"
			loading={lead ? 'eager' : 'lazy'}
			decoding="async"
			class="absolute inset-0 -z-10 size-full scale-150 object-cover opacity-55 blur-3xl saturate-150"
		/>
		<div class="absolute inset-0 -z-10 bg-background/40"></div>

		<div class="pixel-frame canvas-checker grid flex-1 place-items-center [--frame:4px]">
			<FileImage file={cover} {alt} minHeight={lead ? 320 : 160} eager={lead} zoomable />
		</div>

		<div class="plate flex flex-wrap items-center gap-x-4 gap-y-2 py-2 pr-3 pl-2">
			<span
				class={[
					'gem flex shrink-0 items-center justify-center px-2 retro whitespace-nowrap tabular-nums',
					lead ? 'h-10 min-w-16 gap-1.5 text-xs' : 'h-8 min-w-12 text-[0.625rem]',
					// PICO-8 yellow, silver and brown: gold, silver and bronze.
					place === 1 && 'border-[#7a6a00] bg-(--pico-yellow) text-black',
					place === 2 && 'border-[#6b6c70] bg-(--pico-silver) text-black',
					place === 3 && 'border-[#4a2418] bg-(--pico-brown) text-(--pico-white)'
				]}
			>
				{#if lead}<TrophyIcon aria-hidden="true" />{/if}
				{placeLabel}
			</span>
			<div class="min-w-0 flex-1">
				<h3 class={['retro leading-relaxed', lead ? 'text-xs sm:text-base' : 'text-[0.6875rem]']}>
					{contender.modelLabel}
				</h3>
				<p class="text-xs text-muted-foreground">plugin v{contender.plugin}</p>
			</div>
			<ScoreMeter points={contender.points} size={lead ? 'lg' : 'sm'} />
			<p class="w-full text-sm text-muted-foreground">
				{contender.score.passed} of {contender.score.total} checks passed{#if contender.craft}, {Math.round(
						contender.craft.score * 100
					)}% craft{/if}.
				<a
					href={resolve('/g/[id]', { id: contender.run.id })}
					class="text-foreground underline underline-offset-4"
				>
					Open this run
				</a>
			</p>
		</div>
	</article>
</div>
