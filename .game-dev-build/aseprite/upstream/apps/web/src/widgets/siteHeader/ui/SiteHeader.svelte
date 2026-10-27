<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import BookOpenIcon from '~icons/pixelarticons/book-open';
	import GithubIcon from '~icons/pixelarticons/github';
	import ImageMultipleIcon from '~icons/pixelarticons/image-multiple';
	import HumanHandsupIcon from '~icons/pixelarticons/human-handsup';
	import MenuIcon from '~icons/pixelarticons/menu';
	import PlugIcon from '~icons/pixelarticons/plug';
	import PlusIcon from '~icons/pixelarticons/plus';
	import TrophyIcon from '~icons/pixelarticons/trophy';
	import { Button, RetroModeSwitcher, SoundSwitcher } from '#shared/ui/8bit/index.js';
	import { REPO_URL } from '#shared/lib/site.js';
	import { BrandLink } from '#shared/ui/brand/index.js';
	import MobileMenu from './MobileMenu.svelte';
	import type { NavLink } from '../model/types';

	// `accent` marks the one link drawn in the holographic style: the plugin is what the site is for.
	const links: NavLink[] = [
		{ href: resolve('/gallery'), label: 'Gallery', icon: ImageMultipleIcon },
		{ href: resolve('/benchmarks'), label: 'Benchmarks', icon: TrophyIcon },
		{ href: resolve('/knowledge'), label: 'Knowledge', icon: BookOpenIcon },
		{ href: resolve('/plugin'), label: 'Plugin', icon: PlugIcon, accent: true },
		{ href: resolve('/contribute'), label: 'Contribute', icon: HumanHandsupIcon }
	];

	const current = (href: string) =>
		page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);

	let menuOpen = $state(false);

	// The page's own count (from its build or ISR render) until /api/stars answers with the
	// current one: that endpoint shares /plugin's two-hour cache, so both always agree. A failed
	// request keeps what the page had.
	let live = $state<number | null>(null);
	const stars = $derived(live ?? (typeof page.data.stars === 'number' ? page.data.stars : null));
	const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

	onMount(() => {
		fetch('/api/stars')
			.then((response) => (response.ok ? response.json() : null))
			.then((body: { stars?: unknown } | null) => {
				if (typeof body?.stars === 'number') live = body.stars;
			})
			.catch(() => {});
	});
</script>

<a
	href="#main"
	class="sr-only z-50 bg-primary px-4 py-3 retro text-xs text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
	>Skip to content</a
>

<!-- Glass over the page: translucent and blurred, so the art scrolls under it softened. -->
<header
	class="site-header sticky top-0 z-40 border-b-6 border-pixel bg-background/70 backdrop-blur-xl backdrop-saturate-150"
>
	<div class="flex h-16 items-center gap-x-4 px-4 sm:px-6 lg:gap-x-6 lg:px-10">
		<BrandLink size="sm" class="py-1.5" />

		<!-- Below lg the five links and the actions do not fit one row; they move into the menu. -->
		<nav aria-label="Main" class="hidden lg:block">
			<ul class="flex gap-1">
				{#each links as link (link.href)}
					<li>
						<a
							href={link.href}
							aria-current={current(link.href) ? 'page' : undefined}
							class="relative inline-flex h-11 items-center px-2 retro text-[0.625rem] text-muted-foreground transition-colors after:absolute after:inset-x-2 after:bottom-1 after:h-1 after:bg-transparent after:transition-colors hover:text-foreground hover:after:bg-pixel aria-[current=page]:text-foreground aria-[current=page]:after:bg-accent xl:text-xs"
						>
							<span class={link.accent ? 'text-holo' : undefined}>{link.label}</span>
						</a>
					</li>
				{/each}
			</ul>
		</nav>

		<div class="ml-auto flex items-center gap-2">
			<!-- The one call to action on every page: the gallery only grows through submissions. -->
			<Button
				href={resolve('/contribute')}
				size="sm"
				class="text-[0.625rem]"
				aria-label="Add your art"
			>
				<PlusIcon aria-hidden="true" />
				<!-- Icon only on phones, and from lg to xl, where the inline nav takes the room. -->
				<span class="hidden sm:inline lg:hidden xl:inline">Add your art</span>
			</Button>
			<!-- With a count, the icon and the number say "GitHub" on their own; the word comes
			back only when the count is missing. On phones it lives in the menu. -->
			<Button
				href={REPO_URL}
				variant="ghost"
				size="sm"
				rel="noopener"
				class="hidden text-[0.625rem] md:inline-flex"
				aria-label={stars === null ? undefined : `GitHub repository, ${stars} stars`}
			>
				<span class="inline-flex text-holo items-center gap-2">
					<GithubIcon aria-hidden="true" />
					{#if stars === null}
						<span class="hidden sm:inline">GitHub</span>
						<span class="sr-only sm:hidden">GitHub repository</span>
					{:else}
						<span aria-hidden="true">{compact.format(stars)}</span>
					{/if}
				</span>
			</Button>
			<div class="hidden items-center md:flex">
				<SoundSwitcher />
				<RetroModeSwitcher />
			</div>
			<Button
				variant="ghost"
				class="size-11 px-0 lg:hidden"
				aria-label="Open menu"
				aria-haspopup="dialog"
				aria-expanded={menuOpen}
				aria-controls="site-menu"
				onclick={() => (menuOpen = true)}
			>
				<MenuIcon aria-hidden="true" />
			</Button>
		</div>
	</div>
</header>

<MobileMenu
	bind:open={menuOpen}
	id="site-menu"
	{links}
	{current}
	{stars}
	starsLabel={stars === null ? null : compact.format(stars)}
/>
