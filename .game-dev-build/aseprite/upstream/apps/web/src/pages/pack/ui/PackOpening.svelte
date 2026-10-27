<!--
	The pack opens itself: it shakes as its foil catches the light, the top seal tears off with a
	flash, the cards pop up out of the wrapper as it drops away, and they deal out into a fan from
	the middle outwards, in front of a swelling holo glow. It is all CSS
	animation on load, so it plays before hydration and without JavaScript; script only adds
	"skip" (a click on the stage while it plays) and "open again" (the page remounts the stage).

	Every element's resting style is its final, opened state and the keyframes run *from* the
	sealed state toward it. Switching the animations off — reduced motion, or a skip — therefore
	lands on the open fan, never on a half-open pack.

	Arriving from a wall, the sealed pack is the same element as the tile that was clicked (one
	view-transition name): it flies here from the wall, and the opening waits for it to land.

	The fan is a duplicate of the list under it, which is the way in for the keyboard and screen
	readers; here it is hidden from both and left to the pointer.
-->
<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { BoosterPack, takeFlight, type PackSummary } from '#entities/pack/index.js';
	import { playSound, type SoundName } from '#shared/lib/sound/index.js';
	import FanCard from './FanCard.svelte';

	interface Props {
		pack: PackSummary;
		/** The cards are runs of one task, so each is told apart by its model, not its title. */
		modelFirst?: boolean;
	}

	let { pack, modelFirst = false }: Props = $props();
	const count = $derived(pack.generations.length);
	/**
	 * The pack keeps its cards best first (its cover is the top score); the fan lays them out
	 * lowest to highest, so the hand reads left to right towards the winner, on top at the right.
	 */
	const fan = $derived([...pack.generations].reverse());
	/**
	 * From hydration until the last card lands. While it holds, a click anywhere on the stage —
	 * the stacked cards included — finishes the opening instead of following a card's link: the
	 * first thing people do to an animation is click it, and that must not navigate away.
	 */
	let playing = $state(false);
	let skipped = $state(false);
	let stage: HTMLDivElement;
	/**
	 * The pack flew in from a wall tile: that tile was clicked (`takeFlight`), and app/layout
	 * marks <html> while the page transition runs. Read once, at creation — which happens inside
	 * the transition's update — because changing the delays of running animations later would
	 * make them jump. `takeFlight` runs first so the mark is cleared even without a transition.
	 */
	// The initial pack on purpose: the page keys this stage on the pack, so it never changes here.
	const flew = untrack(() => takeFlight(pack.id));
	const arrived =
		flew &&
		typeof document !== 'undefined' &&
		document.documentElement.classList.contains('view-transitioning');
	/**
	 * The pack keeps the shared name only while it is still sealed. Once it has dropped away it
	 * is hidden, and going back must not fly an invisible pack to the wall.
	 */
	let named = $state(true);

	onMount(() => {
		// The animation starts at first paint, not at hydration: on a slow load it may already be
		// over, and a flag left on would swallow the first click on a card.
		playing =
			!matchMedia('(prefers-reduced-motion: reduce)').matches &&
			stage.getAnimations({ subtree: true }).some((animation) => animation.playState === 'running');
		if (!playing && !arrived) named = false;
	});

	function skip(event: MouseEvent) {
		if (!playing) return;
		event.preventDefault();
		skipped = true;
		playing = false;
		named = false;
		playSound('card-fan');
	}

	function landed(event: AnimationEvent) {
		const target = event.target as HTMLElement;
		if (target.dataset.last !== undefined && event.animationName.endsWith('deal')) {
			playing = false;
			named = false;
		}
	}

	/**
	 * The opening's soundtrack, cued by the CSS itself: each keyframes animation fires
	 * `animationstart` when its delay runs out, so the sounds stay in step with whatever timing
	 * the styles set (the flight's extra wait included) and stop with a skip. Svelte scopes the
	 * names as `svelte-<hash>-<name>`, hence the suffix.
	 */
	const CUES: Record<string, SoundName> = {
		shake: 'pack-shake',
		tear: 'pack-tear',
		rise: 'card-rise'
	};
	const DEALS: SoundName[] = ['card-deal-1', 'card-deal-2', 'card-deal-3', 'card-deal-4'];
	/** Both cards of a ring swing out together and make one sound between them. */
	const dealt = new Set<number>();

	function cue(event: AnimationEvent) {
		const name = event.animationName.slice(event.animationName.lastIndexOf('-') + 1);
		if (name !== 'deal') {
			if (CUES[name]) playSound(CUES[name]);
			return;
		}
		const ring = Number((event.target as HTMLElement).style.getPropertyValue('--ring'));
		if (dealt.has(ring)) return;
		dealt.add(ring);
		// A shade higher for each ring outward, so the deal climbs instead of repeating.
		playSound(DEALS[ring % DEALS.length]!, { rate: 0.94 + ring * 0.04 });
	}

	// A loose, hand-held stack before it is dealt: each card a degree or two off, the same way
	// every time so the server render and the client agree.
	const jitter = (index: number) => ((index * 37) % 5) - 2;
	/** The deal blooms from the middle out: the centre card first, the outer pair last. */
	const ring = (index: number) => Math.floor(Math.abs(index - (count - 1) / 2));
	const lastRing = $derived(ring(0));
</script>

<!-- Not a button: once open, the stage is just a picture of cards with links in it, and while
it plays it is hidden from assistive tech like the rest of the fan. -->
<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	bind:this={stage}
	class={[
		'stage relative mx-auto w-full',
		arrived && 'arrived',
		skipped && 'skipped',
		playing && 'playing'
	]}
	style:--n={count}
	title={playing ? 'Click to skip' : undefined}
	onclick={skip}
	onanimationstart={cue}
	onanimationend={landed}
	aria-hidden="true"
>
	<div class="halo absolute left-1/2"></div>
	<div class="burst absolute left-1/2"></div>

	<div class="deck absolute left-1/2">
		{#each fan as generation, index (generation.id)}
			<div
				class="slot absolute inset-0"
				style:--i={index}
				style:--ring={ring(index)}
				style:--jitter="{jitter(index)}deg"
				data-last={ring(index) === lastRing ? '' : undefined}
			>
				<div class="lift">
					<FanCard {generation} {modelFirst} />
				</div>
			</div>
		{/each}
	</div>

	<div class="booster-wrap absolute left-1/2">
		<div class="flash absolute"></div>
		<BoosterPack
			title={pack.title}
			{count}
			cover={pack.generations[0]!.cover}
			heading="p"
			eager
			transitionName={named ? `pack-${pack.id}` : undefined}
		/>
	</div>
</div>

<style>
	/* Lets the foil's highlight sweep across the pack as it shakes: a registered number
	   interpolates, an unregistered custom property would only flip at the end. */
	@property --mx {
		syntax: '<number>';
		inherits: true;
		initial-value: 0.5;
	}

	.stage {
		/* 124px is the narrowest a card still reads at; below it the fan only shows art. */
		--card-w: clamp(124px, 22vw, 216px);
		--card-h: calc(var(--card-w) * 88 / 63);
		/* Dealing: when the centre card swings out, the gap to each next pair outward, how long
		   each swing takes. */
		--deal-at: calc(1150ms + var(--arrive));
		--deal-stagger: 90ms;
		--deal-for: 720ms;
		/* Every start below waits this long: nothing, unless the pack is still flying in from
		   the wall — then the flight (app/styles, `*.pack`) plus a beat to settle. */
		--arrive: 0ms;
		/* The fan's pivot sits this far below the cards: further gives a flatter, wider arc. */
		--pivot: calc(var(--card-h) * 1.6);
		--spread: 66deg;
		--step: min(12deg, calc(var(--spread) / max(var(--n) - 1, 1)));
		--top: 56px;
		/* Never narrower than its own labels need, even when the cards are at their smallest. */
		--booster-w: max(168px, calc(var(--card-w) * 1.3));
		/* Tall enough for the fan's dipping outer cards, and for the sealed pack (its art window
		   is 0.9 of a card, plus about 80px of plate and seals), the taller of the two on a phone. */
		height: calc(var(--top) + max(var(--card-h) * 1.4, var(--card-h) * 0.94 + 84px));
		/* Sideways only: the outer cards may poke past a phone's edge, and `clip` (unlike
		   `hidden`) does that without a scroll container. Up and down stay open, so the glow and
		   a lifted card are not cut off along a line. */
		overflow-x: clip;
		user-select: none;
	}
	.stage.arrived {
		--arrive: 560ms;
	}
	@media (max-width: 640px) {
		.stage {
			--card-w: clamp(124px, 32vw, 216px);
			--pivot: calc(var(--card-h) * 1.15);
			--spread: 40deg;
		}
	}

	/* --- The fan ---------------------------------------------------------------------------- */
	.deck {
		top: var(--top);
		width: var(--card-w);
		height: var(--card-h);
		translate: -50% 0;
		/* `unseen` keeps the stack hidden while the pack is in flight: the pack flies above the
		   page in a layer of its own, so nothing on the stage would be covering the cards yet. */
		animation:
			rise 640ms cubic-bezier(0.3, 0, 0.3, 1) calc(760ms + var(--arrive)) both,
			unseen var(--arrive) step-end both;
	}
	.slot {
		--angle: calc((var(--i) - (var(--n) - 1) / 2) * var(--step));
		z-index: var(--i);
		transform-origin: 50% calc(100% + var(--pivot));
		rotate: var(--angle);
		animation: deal var(--deal-for) cubic-bezier(0.2, 1.25, 0.35, 1)
			calc(var(--deal-at) + var(--ring) * var(--deal-stagger)) both;
	}
	.lift {
		transition:
			translate 220ms cubic-bezier(0.2, 1.3, 0.4, 1),
			scale 220ms cubic-bezier(0.2, 1.3, 0.4, 1);
	}
	/* The card under the pointer comes to the front and out of the hand, along its own axis.
	   Pointer devices only: on touch a tap would make the card jump just before it navigates. */
	@media (hover: hover) {
		.stage:not(.playing) .slot:hover {
			z-index: 100;
		}
		.stage:not(.playing) .slot:hover .lift {
			translate: 0 -12%;
			scale: 1.06;
		}
	}

	/* --- The pack ---------------------------------------------------------------------------- */
	.booster-wrap {
		--shine: 1;
		--my: 0.3;
		top: calc(var(--top) + var(--card-h) * 0.04);
		width: var(--booster-w);
		z-index: 200;
		pointer-events: none;
		translate: -50% 70%;
		opacity: 0;
		visibility: hidden;
		animation:
			shake 380ms ease-in-out calc(160ms + var(--arrive)) both,
			sweep 900ms ease-in-out var(--arrive) both,
			drop 520ms cubic-bezier(0.5, 0, 0.75, 0) calc(980ms + var(--arrive)) both;
	}
	/* Tall enough to hide a whole card before it rises. */
	.booster-wrap :global(.window) {
		min-height: calc(var(--card-h) * 0.9);
	}
	.booster-wrap :global([data-part='top']) {
		transform-origin: 85% 100%;
		animation: tear 460ms cubic-bezier(0.3, 0, 0.6, 1) calc(560ms + var(--arrive)) both;
	}
	.flash {
		inset: -30% -40% auto;
		height: 60%;
		background: radial-gradient(closest-side, rgb(255 255 255 / 0.8), transparent);
		opacity: 0;
		animation: flash 600ms ease-out calc(600ms + var(--arrive)) both;
	}

	/* --- The light behind the fan ------------------------------------------------------------- */
	/* A soft holo glow that swells as the cards come out, and a ring of rays turning slowly in
	   it. Both are centred a little below the cards' middle, where the fan's weight is. */
	.halo,
	.burst {
		top: calc(var(--top) + var(--card-h) * 0.6);
		aspect-ratio: 1;
		translate: -50% -50%;
		pointer-events: none;
	}
	/* Kept close and faint: a light just behind the cards, not a disc over the page. The rays
	   carry the size. */
	.halo {
		width: calc(var(--card-h) * 2.2);
		background: radial-gradient(
			closest-side,
			color-mix(in oklab, var(--holo-3) 26%, transparent),
			color-mix(in oklab, var(--holo-2) 8%, transparent) 55%,
			transparent
		);
		filter: blur(16px);
		opacity: 0.7;
		animation: swell 1100ms cubic-bezier(0.2, 0.8, 0.3, 1) calc(900ms + var(--arrive)) both;
	}
	.burst {
		width: calc(var(--card-h) * 3.2);
		background: repeating-conic-gradient(
			from 0deg,
			color-mix(in oklab, var(--holo-2) 60%, transparent) 0deg 5deg,
			transparent 5deg 15deg,
			color-mix(in oklab, var(--holo-4) 60%, transparent) 15deg 20deg,
			transparent 20deg 30deg
		);
		mask: radial-gradient(closest-side, #000 18%, transparent 78%);
		opacity: 0.55;
		animation:
			swell 1000ms cubic-bezier(0.2, 0.8, 0.3, 1) calc(1000ms + var(--arrive)) both,
			spin 120s linear calc(1000ms + var(--arrive)) infinite;
	}

	@keyframes shake {
		0%,
		100% {
			rotate: 0deg;
		}
		20% {
			rotate: -3deg;
		}
		45% {
			rotate: 3.5deg;
		}
		70% {
			rotate: -2deg;
		}
		88% {
			rotate: 1deg;
		}
	}
	/* The foil catches the light once, left to right, while the pack shakes. */
	@keyframes sweep {
		from {
			--mx: -0.2;
		}
		to {
			--mx: 1.2;
		}
	}
	@keyframes drop {
		from {
			translate: -50% 0;
			opacity: 1;
			visibility: visible;
		}
		to {
			translate: -50% 70%;
			opacity: 0;
			visibility: visible;
		}
	}
	@keyframes tear {
		from {
			translate: 0 0;
			rotate: 0deg;
			opacity: 1;
		}
		to {
			translate: 24% -180%;
			rotate: -16deg;
			opacity: 0;
		}
	}
	@keyframes flash {
		from {
			opacity: 0;
			scale: 0.3;
		}
		30% {
			opacity: 1;
		}
		to {
			opacity: 0;
			scale: 1.6;
		}
	}
	/* Out of the pack and a little past where the hand holds them, then settling into it. */
	@keyframes rise {
		from {
			translate: -50% calc(var(--card-h) * 0.15);
		}
		60% {
			translate: -50% calc(var(--card-h) * -0.1);
		}
	}
	/* Each card swings out on an arc: lifted mid-swing, set down as it lands. */
	@keyframes deal {
		from {
			rotate: var(--jitter);
			translate: 0 0;
		}
		45% {
			translate: 0 -6%;
		}
	}
	@keyframes unseen {
		from {
			visibility: hidden;
		}
	}
	@keyframes swell {
		from {
			opacity: 0;
			scale: 0.3;
		}
	}
	@keyframes spin {
		to {
			rotate: 1turn;
		}
	}

	/* Skipped, or motion reduced: every element drops straight to its resting, opened style.
	   A skip keeps the rays turning; reduced motion stops them too. */
	.skipped :is(.deck, .slot, .booster-wrap, .flash, .halo),
	.skipped :global([data-part='top']) {
		animation: none;
	}
	.skipped .burst {
		animation: spin 120s linear infinite;
	}
	@media (prefers-reduced-motion: reduce) {
		.deck,
		.slot,
		.booster-wrap,
		.flash,
		.halo,
		.burst,
		.booster-wrap :global([data-part='top']) {
			animation: none;
		}
		.lift {
			transition: none;
		}
	}
</style>
