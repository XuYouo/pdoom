<!--
	A foil highlight that follows the pointer: a soft white spot where it points and a band of the
	holo colours that slides as it crosses. Reads `--mx`, `--my` and `--shine` from an ancestor
	carrying `pointerShine`. color-dodge brightens the art under it rather than painting over it.
	Place it last inside a positioned, clipped box.
-->
<script lang="ts">
	interface Props {
		/** Peak opacity while pointed at. */
		strength?: number;
	}

	let { strength = 0.55 }: Props = $props();
</script>

<div
	class="holo-shine pointer-events-none absolute inset-0 z-[3]"
	style:--strength={strength}
	aria-hidden="true"
></div>

<style>
	.holo-shine {
		opacity: calc(var(--shine, 0) * var(--strength));
		mix-blend-mode: color-dodge;
		background:
			radial-gradient(
				circle at calc(var(--mx, 0.5) * 100%) calc(var(--my, 0.5) * 100%),
				rgb(255 255 255 / 0.5),
				transparent 45%
			),
			linear-gradient(
					115deg,
					transparent 20%,
					var(--holo-1) 34%,
					var(--holo-3) 44%,
					var(--holo-4) 54%,
					var(--holo-5) 62%,
					transparent 76%
				)
				calc(var(--mx, 0.5) * 100%) 0 / 260% 100% no-repeat;
		transition: opacity 200ms ease-out;
	}
	@media (prefers-reduced-motion: reduce) {
		.holo-shine {
			transition: none;
		}
	}
</style>
