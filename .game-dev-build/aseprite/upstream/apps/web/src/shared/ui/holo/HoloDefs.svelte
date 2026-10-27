<!--
	The gradient `.text-holo` icons fill with (see app/styles/index.css). Rendered once per page;
	the stops read the same --holo-* colours as the text, so both themes match.
	userSpaceOnUse, spanning 0–32 viewBox units: one sweep across the whole mark (24-unit icons,
	the 32-unit pebbly logo). The default objectBoundingBox would restart the gradient on every
	`<rect>` run of a pixel sprite and turn it into colour noise.
-->
<svg width="0" height="0" aria-hidden="true" focusable="false" class="absolute">
	<defs>
		<linearGradient id="holo-fill" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="32" y2="12">
			<stop offset="0" style:stop-color="var(--holo-1)" />
			<stop offset="0.3" style:stop-color="var(--holo-2)" />
			<stop offset="0.55" style:stop-color="var(--holo-3)" />
			<stop offset="0.8" style:stop-color="var(--holo-4)" />
			<stop offset="1" style:stop-color="var(--holo-5)" />
		</linearGradient>
	</defs>
</svg>
