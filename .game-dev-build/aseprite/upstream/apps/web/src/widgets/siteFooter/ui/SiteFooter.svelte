<script lang="ts">
	import { resolve } from '$app/paths';
	import { PEBBLY_LOGO, PICO8 } from '#shared/config/index.js';
	import { REPO_URL, RUBRIC_URL, STUDIO_URL, SUBMIT_SKILL_URL } from '#shared/lib/site.js';
	import { PixelSprite } from '#shared/ui/pixel/index.js';
	import { BrandLink } from '#shared/ui/brand/index.js';

	const swatches = Object.values(PICO8);
	// Evaluated again on hydration, so it shows the visitor's current year, not the build year.
	const year = new Date().getFullYear();

	const plugin = [
		{ label: 'Source on GitHub', href: REPO_URL },
		{ label: 'Changelog', href: `${REPO_URL}/blob/main/CHANGELOG.md` },
		{ label: 'Scoring rubric', href: RUBRIC_URL },
		{ label: 'The submit skill', href: SUBMIT_SKILL_URL }
	];
</script>

<!-- A slightly raised ground, so the footer reads as the floor the page comes to rest on. -->
<footer
	class="site-footer mt-24 border-t-6 border-pixel bg-card/30 [&_li_a]:text-muted-foreground [&_li_a]:transition-colors [&_li_a:hover]:text-foreground"
>
	<!-- PICO-8's sixteen colours: every benchmark and the mascot are drawn in it. -->
	<div class="flex h-2" aria-hidden="true">
		{#each swatches as color (color)}
			<span class="flex-1" style:background-color={color}></span>
		{/each}
	</div>

	<div
		class="grid gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] lg:px-10"
	>
		<div class="max-w-[46ch]">
			<BrandLink size="lg" />
			<p class="mt-5 text-muted-foreground">
				Pixel art drawn by AI agents in a live Aseprite window, through
				<a href={resolve('plugin')} class="text-foreground underline underline-offset-4"
					>Aseprite AI Artist</a
				>. Every piece keeps its prompts, its model and its source file.
			</p>
		</div>

		<nav aria-labelledby="footer-explore">
			<h2 id="footer-explore" class="retro text-[0.625rem] text-muted-foreground">Explore</h2>
			<ul class="mt-5 space-y-3">
				<li><a href={resolve('gallery')} class="hover:underline">Gallery</a></li>

				<li>
					<a href={resolve('benchmarks')} class="hover:underline">Benchmarks</a>
				</li>

				<li>
					<a href={resolve('knowledge')} class="hover:underline">Knowledge base</a>
				</li>

				<li>
					<a href={resolve('knowledge/palettes')} class="hover:underline">Palettes</a>
				</li>

				<li>
					<a href={resolve('contribute')} class="hover:underline">Contribute</a>
				</li>
			</ul>
		</nav>

		<nav aria-labelledby="footer-plugin">
			<h2 id="footer-plugin" class="retro text-[0.625rem] text-muted-foreground">The plugin</h2>
			<ul class="mt-5 space-y-3">
				<li><a href={resolve('plugin')} class="hover:underline">Skills, agents and README</a></li>
				<li><a href={resolve('plugin/install')} class="hover:underline">Install guide</a></li>
				{#each plugin as link (link.href)}
					<li><a href={link.href} class="hover:underline" rel="noopener">{link.label}</a></li>
				{/each}
			</ul>
		</nav>
	</div>

	<div
		class="flex flex-col-reverse gap-6 border-t-4 border-pixel px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10"
	>
		<p>© {year} pebbly · plugin and site under the MIT license</p>
		<a
			href={STUDIO_URL}
			class="group inline-flex items-center gap-4 text-foreground"
			rel="noopener"
		>
			<!-- The logo's strokes are currentColor rects, so .text-holo fills them with its gradient. -->
			<span class="shrink-0 text-holo">
				<PixelSprite rows={PEBBLY_LOGO} scale={1} inheritOutline />
			</span>
			<span class="retro text-xs"
				>by <span class="text-holo decoration-(--holo-3) underline-offset-4 group-hover:underline"
					>pebbly</span
				></span
			>
		</a>
	</div>
</footer>
