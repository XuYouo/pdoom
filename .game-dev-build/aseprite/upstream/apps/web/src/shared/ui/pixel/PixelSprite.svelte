<script lang="ts">
	import { PICO8 } from '#shared/config/index.js';

	interface Props {
		rows: string[];
		/** CSS size of one source pixel. */
		scale: number;
		inheritOutline?: boolean;
		label?: string;
		class?: string;
	}

	let { rows, scale, inheritOutline = false, label, class: className }: Props = $props();

	const width = $derived(Math.max(...rows.map((row) => row.length)));

	// Index '1' is mapped to `currentColor` so the mark's silhouette follows the parent text colour
	// (the header switches to white in dark mode; the navy outline disappears, like an icon does).
	const runs = $derived.by(() => {
		const out: { x: number; y: number; w: number; fill: string }[] = [];
		rows.forEach((row, y) => {
			let x = 0;
			while (x < row.length) {
				const ch = row[x]!;
				let end = x + 1;
				while (end < row.length && row[end] === ch) end++;
				const fill = ch === '1' && inheritOutline ? 'currentColor' : PICO8[ch];
				if (fill) out.push({ x, y, w: end - x, fill });
				x = end;
			}
		});
		return out;
	});
</script>

<svg
	viewBox="0 0 {width} {rows.length}"
	width={width * scale}
	height={rows.length * scale}
	shape-rendering="crispEdges"
	class={className}
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
>
	{#each runs as run (`${run.x},${run.y}`)}
		<rect x={run.x} y={run.y} width={run.w} height="1" fill={run.fill} />
	{/each}
</svg>
