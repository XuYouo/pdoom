<script lang="ts">
	import { resolve } from '$app/paths';
	import ChartIcon from '~icons/pixelarticons/chart-bar';
	import { CopyButton } from '#features/copyPrompt/index.js';
	import {
		Button,
		Card,
		CardContent,
		CardDescription,
		CardFooter,
		CardHeader,
		CardTitle,
		Kbd
	} from '#shared/ui/8bit/index.js';
	import { GALLERY_README_URL, SUBMIT_SKILL_URL } from '#shared/lib/site.js';
	import { Seo } from '#shared/ui/seo/index.js';

	const steps = [
		{
			title: 'Make something',
			body: 'Draw with the plugin in any harness it supports: a sprite, a tileset, an animation, anything that came out of a live Aseprite window.'
		},
		{
			title: 'Run the submit skill',
			body: 'In Claude Code, type the command below. It exports a cover, saves the .aseprite source, writes generation.yaml with your prompts, models and plugin version, and checks it all against the gallery rules.'
		},
		{
			title: 'Open the pull request',
			body: 'The skill opens a pull request against the repository. CI runs the same checks; once it is merged, the piece appears in the gallery.'
		}
	];
</script>

<Seo title="Contribute" description="How to add your own AI-drawn pixel art to the gallery." />

<header class="page-hero mx-auto max-w-3xl px-4 pt-12 sm:px-6 sm:pt-16">
	<p class="eyebrow">Contribute</p>
	<h1 class="title-depth mt-5 text-2xl leading-snug sm:text-4xl sm:leading-snug">Add your work</h1>
	<p class="lead mt-5">
		The gallery is a folder in the repository, and every piece arrives as a pull request. You keep
		the credit; the files, prompts and model names stay with the art so anyone can reproduce or
		compare it.
	</p>
</header>

<div class="mx-auto max-w-3xl px-4 sm:px-6">
	<!-- The same stepper as the install page: a dashed pixel rail from gem to gem. -->
	<ol class="mt-14">
		{#each steps as step, index (step.title)}
			<li class="relative grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 pb-14 last:pb-0 sm:gap-x-7">
				{#if index < steps.length - 1}
					<span
						class="absolute top-[3.75rem] bottom-2 left-[22px] w-1 bg-[repeating-linear-gradient(180deg,var(--pixel)_0_8px,transparent_8px_16px)]"
						aria-hidden="true"
					></span>
				{/if}
				<span class="z-10 h-fit" aria-hidden="true">
					<span class="gem grid size-12 place-items-center retro text-base">{index + 1}</span>
				</span>
				<div class="min-w-0 pt-2">
					<h2 class="text-sm leading-relaxed sm:text-base">{step.title}</h2>
					<p class="mt-3 text-muted-foreground">{step.body}</p>
					{#if index === 0}
						<p class="mt-3 text-muted-foreground">
							No plugin yet? The <a
								href={resolve('plugin/install')}
								class="text-foreground underline underline-offset-4">install guide</a
							>
							takes about a minute, and the
							<a href={resolve('plugin')} class="text-foreground underline underline-offset-4"
								>plugin page</a
							> lists every skill it ships.
						</p>
					{/if}
					{#if index === 1}
						<div class="pixel-frame mt-5 bg-card [--frame:4px]">
							<div class="flex items-center gap-2 border-b-4 border-pixel py-1 pr-2 pl-4">
								<span class="size-2.5 bg-pico-red" aria-hidden="true"></span>
								<span class="size-2.5 bg-pico-yellow" aria-hidden="true"></span>
								<span class="size-2.5 bg-pico-green" aria-hidden="true"></span>
								<span
									class="ml-2 min-w-0 flex-1 truncate retro text-[0.625rem] text-muted-foreground"
									>Claude Code</span
								>
								<CopyButton text="/aseprite:submit" label="Copy" done="Copied /aseprite:submit" />
							</div>
							<div class="px-4 py-4">
								<Kbd class="h-9 px-3 text-sm">/aseprite:submit</Kbd>
							</div>
						</div>
					{/if}
				</div>
			</li>
		{/each}
	</ol>

	<section class="mt-20" aria-labelledby="benchmarks-note">
		<div class="pixel-frame flex gap-4 bg-card p-5 sm:p-6">
			<span class="gem grid size-12 shrink-0 place-items-center" aria-hidden="true">
				<ChartIcon />
			</span>
			<div>
				<h2 id="benchmarks-note" class="text-sm leading-relaxed">What about benchmarks?</h2>
				<p class="mt-3 text-muted-foreground">
					Contributions go to the gallery. The benchmarks are run by the maintainers, under the same
					fixed setup every time, so the scores stay comparable; new models are added as they are
					tested.
				</p>
			</div>
		</div>
	</section>

	<div class="mt-16 px-1.5 pb-4">
		<Card font="normal">
			<CardHeader>
				<CardTitle class="text-sm leading-relaxed sm:text-base">Prefer to do it by hand?</CardTitle>
				<CardDescription font="normal" class="font-sans text-base">
					The gallery README describes the folder layout, every field of <code>generation.yaml</code
					>, and the file size limits.
				</CardDescription>
			</CardHeader>
			<CardContent font="normal" class="text-muted-foreground">
				Run <code class="text-foreground">pnpm gallery:check</code> before you push; CI runs it too.
			</CardContent>
			<CardFooter class="flex flex-wrap gap-6 pt-2">
				<Button href={GALLERY_README_URL} variant="outline" rel="noopener">Gallery README</Button>
				<Button href={SUBMIT_SKILL_URL} variant="outline" rel="noopener">Submit skill</Button>
			</CardFooter>
		</Card>
	</div>
</div>
