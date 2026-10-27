<!--
	The site's mascot and name, linking home. Header and footer render the same component at
	different sizes, so the hover animation stays one implementation.

	Hover or keyboard focus: Pebbly hops (stretch on the way up, squash on landing, as an
	animator would key it) and the name ripples letter by letter into the holographic accent.
	The movement is stepped like sprite frames; the colour is not — it fades. The gradient is
	always clipped to the letters, hidden under a solid text fill, and hover transitions that
	fill to transparent (a gradient itself cannot be transitioned). Each letter carries its
	index as --i for the stagger and for its slice of the gradient, so the letters read as one
	sweep.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { PEBBLY_MARK } from '#shared/config/index.js';
	import { SITE_NAME } from '#shared/lib/site.js';
	import { PixelSprite } from '#shared/ui/pixel/index.js';

	type Size = 'sm' | 'lg';

	let { size = 'sm', class: className = '' }: { size?: Size; class?: string } = $props();

	const sizes = {
		sm: { scale: 2, text: 'text-xs sm:text-sm', hop: '-8px', wave: '-4px' },
		lg: { scale: 3, text: 'text-base', hop: '-12px', wave: '-6px' }
	} satisfies Record<Size, { scale: number; text: string; hop: string; wave: string }>;

	const s = $derived(sizes[size]);
</script>

<a
	href={resolve('/')}
	class="brand-link inline-flex items-center gap-3 {className}"
	style:--hop={s.hop}
	style:--wave={s.wave}
	aria-label="{SITE_NAME}, home"
>
	<span class="brand-mascot inline-flex">
		<PixelSprite rows={PEBBLY_MARK} scale={s.scale} inheritOutline />
	</span>
	<span class="retro whitespace-nowrap {s.text}" aria-hidden="true">
		{#each SITE_NAME as letter, index (index)}
			<span class="brand-letter inline-block" style:--i={index}>{letter}</span>
		{/each}
	</span>
</a>

<style>
	.brand-mascot {
		transform-origin: 50% 100%;
	}
	.brand-link:is(:hover, :focus-visible) .brand-mascot {
		animation: brand-hop 640ms steps(8, end);
	}
	.brand-letter {
		background-image: linear-gradient(
			100deg,
			var(--holo-1),
			var(--holo-2),
			var(--holo-3),
			var(--holo-4),
			var(--holo-5),
			var(--holo-2),
			var(--holo-1)
		);
		background-size: 600% 100%;
		background-position: calc(var(--i) * 20%) 50%;
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: var(--foreground);
		filter: drop-shadow(0 0 0 transparent) drop-shadow(0 0 0 transparent)
			drop-shadow(0 0 0 transparent);
		transition:
			-webkit-text-fill-color 450ms ease-out,
			filter 450ms ease-out;
		transition-delay: calc(var(--i) * 70ms);
	}
	.brand-link:is(:hover, :focus-visible) .brand-letter {
		-webkit-text-fill-color: transparent;
		filter: drop-shadow(1px 1px 0 var(--holo-depth)) drop-shadow(1px 1px 0 var(--holo-depth))
			drop-shadow(0 0 6px var(--holo-glow));
		animation: brand-wave 480ms steps(4, end) calc(var(--i) * 70ms) both;
	}
	@keyframes brand-hop {
		0% {
			transform: translateY(0) scale(1, 1);
		}
		15% {
			transform: translateY(1px) scale(1.15, 0.85);
		}
		45% {
			transform: translateY(var(--hop)) scale(0.9, 1.12);
		}
		75% {
			transform: translateY(0) scale(1.2, 0.8);
		}
		90% {
			transform: translateY(0) scale(0.95, 1.05);
		}
		100% {
			transform: translateY(0) scale(1, 1);
		}
	}
	@keyframes brand-wave {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(var(--wave));
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.brand-link .brand-mascot,
		.brand-link .brand-letter {
			animation: none !important;
		}
	}
</style>
