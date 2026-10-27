<script lang="ts">
	import { Seo } from '#shared/ui/seo/index.js';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { PixelSprite } from '#shared/ui/pixel/index.js';
	import { Button } from '#shared/ui/8bit/index.js';
	import { PEBBLY_FRAMES } from '#shared/config/index.js';

	const missing = $derived(page.status === 404);
</script>

<Seo title={missing ? 'Not found' : 'Error'} noindex />

<section class="page-hero [--hero-x:50%]">
	<div
		class="mx-auto flex max-w-3xl flex-col items-center px-4 pt-14 pb-16 text-center sm:px-6 sm:pt-20"
	>
		<p class="eyebrow">{missing ? 'Page not found' : 'Error'}</p>

		<!-- The status as the showpiece: Pebbly stands on the canvas under the number. -->
		<p
			class="title-depth mt-8 retro text-[4.5rem] leading-none tabular-nums sm:text-[8rem]"
			aria-hidden="true"
		>
			{page.status}
		</p>
		<div class="mt-10">
			<div class="canvas-checker pixel-frame grid place-items-center p-6">
				<PixelSprite rows={PEBBLY_FRAMES[3]!} scale={4} label="Pebbly watching a paint drop fall" />
			</div>
		</div>

		<h1 class="title-depth mt-12 text-lg leading-relaxed sm:text-2xl sm:leading-relaxed">
			{missing ? 'Nothing on this canvas' : 'Something went wrong'}
		</h1>
		<p class="lead mt-5">
			{#if missing}
				There is no page at <code class="break-all text-foreground">{page.url.pathname}</code>. The
				piece may have been renamed, or the link mistyped.
			{:else}
				{page.error?.message ?? 'The page failed to render.'}
			{/if}
		</p>

		<div class="mt-10 flex flex-wrap items-center justify-center gap-6 px-1.5">
			<Button href={resolve('gallery')} variant="accent" size="lg">Go to the gallery</Button>
			<Button href={resolve('/')} variant="outline" size="lg">Home</Button>
		</div>
	</div>
</section>
