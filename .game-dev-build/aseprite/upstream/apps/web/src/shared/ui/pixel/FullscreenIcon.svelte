<script lang="ts">
	// The four-corner "full screen" glyph players use (YouTube, browsers), drawn on
	// pixelarticons' 24px grid with 2px strokes: the set has no such icon, and `expand` (two
	// arrows) reads as "resize" rather than "full screen".
	let { class: className }: { class?: string } = $props();
</script>

<svg viewBox="0 0 24 24" width="24" height="24" data-pixel-icon aria-hidden="true" class={className}>
	<path fill="currentColor" d="M3 3h7v2H5v5H3zM14 3h7v7h-2V5h-5zM3 14h2v5h5v2H3zM19 14h2v7h-7v-2h5z" />
</svg>
