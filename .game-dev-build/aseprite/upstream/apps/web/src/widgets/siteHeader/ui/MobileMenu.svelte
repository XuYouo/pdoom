<script lang="ts">
	import { resolve } from '$app/paths';
	import { afterNavigate } from '$app/navigation';
	import { MediaQuery } from 'svelte/reactivity';
	import CloseIcon from '~icons/pixelarticons/close';
	import GithubIcon from '~icons/pixelarticons/github';
	import PlusIcon from '~icons/pixelarticons/plus';
	import { Button, RetroModeSwitcher, SoundSwitcher } from '#shared/ui/8bit/index.js';
	import { REPO_URL } from '#shared/lib/site.js';
	import { playSound } from '#shared/lib/sound/index.js';
	import type { NavLink } from '../model/types';

	interface Props {
		open: boolean;
		/** The dialog's id, which the menu button names in `aria-controls`. */
		id: string;
		links: NavLink[];
		current: (href: string) => boolean;
		stars: number | null;
		/** `stars`, formatted the way the header shows it. */
		starsLabel: string | null;
	}

	let { open = $bindable(), id, links, current, stars, starsLabel }: Props = $props();

	let dialog = $state<HTMLDialogElement>();

	// A native modal <dialog>, as the lightbox uses: focus moves in and is handed back to the menu
	// button, Escape closes it, and the page behind is inert. It stays mounted while closed so the
	// button's aria-controls always points at something.
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			dialog.showModal();
			playSound('open');
		}
		if (!open && dialog.open) {
			dialog.close();
			playSound('close');
		}
	});

	$effect(() => {
		if (!open) return;
		const scroll = document.documentElement.style.overflow;
		document.documentElement.style.overflow = 'hidden';
		return () => {
			document.documentElement.style.overflow = scroll;
		};
	});

	// At lg the header shows every link itself and the menu button is gone, so a menu left open
	// while the window widens would have no way back to it.
	const wide = new MediaQuery('min-width: 1024px');
	$effect(() => {
		if (wide.current) open = false;
	});

	// Covers the browser's back and forward buttons too, not only the links in the menu.
	afterNavigate(() => {
		open = false;
	});
</script>

<dialog
	bind:this={dialog}
	{id}
	aria-labelledby="{id}-title"
	class="site-menu m-0 ml-auto h-dvh max-h-none w-[min(24rem,100vw)] max-w-none border-0 border-l-6 border-pixel bg-background/80 p-0 text-foreground backdrop-blur-xl"
	onclose={() => (open = false)}
	onclick={(event) => {
		// The dialog element itself is only hit through the backdrop.
		if (event.target === event.currentTarget) open = false;
	}}
>
	<div class="flex h-full flex-col">
		<div class="flex h-16 shrink-0 items-center justify-between border-b-6 border-pixel pr-2 pl-5">
			<h2 id="{id}-title" class="retro text-xs">Menu</h2>
			<Button
				variant="ghost"
				class="size-11 px-0"
				aria-label="Close menu"
				onclick={() => (open = false)}
			>
				<CloseIcon aria-hidden="true" />
			</Button>
		</div>

		<nav aria-label="Main" class="min-h-0 flex-1 overflow-y-auto py-3">
			<ul>
				{#each links as link, i (link.href)}
					<li class="site-menu-item" style:--i={i}>
						<a
							href={link.href}
							aria-current={current(link.href) ? 'page' : undefined}
							class="relative flex min-h-14 items-center gap-4 border-l-6 border-transparent px-5 retro text-xs text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-accent aria-[current=page]:border-accent aria-[current=page]:bg-muted aria-[current=page]:text-foreground"
							onclick={() => (open = false)}
						>
							<link.icon aria-hidden="true" />
							<span class={link.accent ? 'text-holo' : undefined}>{link.label}</span>
							{#if current(link.href)}
								<span class="ml-auto size-2 bg-accent" aria-hidden="true"></span>
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		</nav>

		<div
			class="shrink-0 space-y-5 border-t-6 border-pixel px-5 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
		>
			<div class="px-1.5">
				<Button
					href={resolve('/contribute')}
					class="w-full text-[0.625rem]"
					onclick={() => (open = false)}
				>
					<PlusIcon aria-hidden="true" />
					Add your art
				</Button>
			</div>
			<div class="flex items-center justify-between gap-4">
				<a
					href={REPO_URL}
					rel="noopener"
					class="inline-flex min-h-11 items-center gap-2 text-sm underline-offset-4 hover:underline"
					aria-label={stars === null ? 'GitHub repository' : `GitHub repository, ${stars} stars`}
				>
					<span class="text-holo"><GithubIcon aria-hidden="true" /></span>
					GitHub
					{#if starsLabel}
						<span class="text-holo retro text-[0.625rem]" aria-hidden="true">{starsLabel}</span>
					{/if}
				</a>
				<div class="flex items-center gap-2 text-sm text-muted-foreground">
					Sound
					<SoundSwitcher />
					Theme
					<RetroModeSwitcher />
				</div>
			</div>
		</div>
	</div>
</dialog>

<style>
	.site-menu::backdrop {
		background: rgb(8 7 12 / 0.7);
		backdrop-filter: blur(6px);
	}
	/* Slides in from the edge it is pinned to, in sprite-like steps rather than a smooth glide. */
	.site-menu[open] {
		animation: site-menu-in 160ms steps(4, end);
	}
	.site-menu[open]::backdrop {
		animation: site-menu-fade 160ms steps(4, end);
	}
	/* Rows step in one after another; --i is the row index set in the markup. */
	.site-menu[open] .site-menu-item {
		animation: site-menu-item-in 240ms steps(4, end) backwards;
		animation-delay: calc(80ms + var(--i, 0) * 40ms);
	}
	@keyframes site-menu-item-in {
		from {
			opacity: 0;
			transform: translateX(1.5rem);
		}
	}
	@keyframes site-menu-in {
		from {
			transform: translateX(100%);
		}
	}
	@keyframes site-menu-fade {
		from {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.site-menu[open],
		.site-menu[open]::backdrop,
		.site-menu[open] .site-menu-item {
			animation: none;
		}
	}
</style>
