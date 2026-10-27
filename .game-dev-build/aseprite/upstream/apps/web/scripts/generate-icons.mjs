/**
 * Builds the whole icon set and the OG image from one source — the 16×16 Pebbly icon
 * (`gallery/generations/2026-09-29-pebbly-mascot/pebbly-icon.png`, stored at 8× scale).
 *
 * Run it by hand whenever the icon changes: `pnpm --filter @pebbly/web run generate:icons`.
 * The output is committed to `static/`; the site build never regenerates it.
 *
 * The icons come out of RealFaviconGenerator's generator (the same one with-pebbly/pebbly
 * uses): file names, the ICO's frames and the platform quirks are its to keep up with.
 * What stays here is the part it has no opinion about — pixel art. The source is traced
 * into an SVG of whole pixels with `crispEdges`, and every output size is picked so the
 * 16-px grid lands on an integer multiple, so no size gets a blurred, half-pixel edge.
 *
 * `static/site.webmanifest` is NOT written here: RealFaviconGenerator's has no room for
 * `description`, `start_url` or `scope`. Ours is hand-written and names the PNGs below.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	IconTransformationType,
	generateFaviconFiles,
	initFaviconIconSettings,
	stringToSvg
} from '@realfavicongenerator/generate-favicon';
import { getNodeImageAdapter } from '@realfavicongenerator/image-adapter-node';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = join(root, '../../gallery/generations/2026-09-29-pebbly-mascot/pebbly-icon.png');
const staticDir = join(root, 'static');

/** The native grid of the source art; the PNG is that grid at 8×. */
const GRID = 16;
/** The site's dark ground — `theme-color` in the layout. */
const GROUND = '#111016';
const MUTED = '#a7a3b5';

/** One `<rect>` per horizontal run of same-coloured pixels, transparent pixels skipped. */
async function traceRuns() {
	const { data, info } = await sharp(sourcePath)
		.resize(GRID, GRID, { kernel: 'nearest' })
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	const colour = (x, y) => {
		const i = (y * info.width + x) * 4;
		if (data[i + 3] === 0) return null;
		const hex = [data[i], data[i + 1], data[i + 2]]
			.map((c) => c.toString(16).padStart(2, '0'))
			.join('');
		return data[i + 3] === 255
			? `#${hex}`
			: `#${hex}" fill-opacity="${(data[i + 3] / 255).toFixed(3)}`;
	};
	const rects = [];
	for (let y = 0; y < GRID; y++) {
		for (let x = 0; x < GRID;) {
			const fill = colour(x, y);
			let end = x + 1;
			while (end < GRID && colour(end, y) === fill) end++;
			if (fill)
				rects.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${fill}"/>`);
			x = end;
		}
	}
	return rects.join('');
}

const pixels = await traceRuns();
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="${GRID}" height="${GRID}" viewBox="0 0 ${GRID} ${GRID}" shape-rendering="crispEdges">${pixels}</svg>`;

/** Mark plus name on the site's ground, 1200×630 — what a shared link previews as. */
const OG_SCALE = 20;
const og =
	`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" shape-rendering="crispEdges">` +
	`<rect width="1200" height="630" fill="${GROUND}"/>` +
	`<g transform="translate(120 155) scale(${OG_SCALE})">${pixels}</g>` +
	`<text x="470" y="300" font-family="Menlo, Monaco, 'Courier New', monospace" font-size="96" font-weight="700" fill="#ffffff">Pixeli</text>` +
	`<text x="474" y="370" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="34" fill="${MUTED}">Pixel art drawn by AI agents in Aseprite</text>` +
	`<text x="474" y="420" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="28" fill="${MUTED}">Aseprite AI Artist · MCP plugin for Claude Code</text>` +
	`</svg>`;

const adapter = await getNodeImageAdapter();
const master = stringToSvg(icon, adapter);

/**
 * Opaque ground behind the icon for the platforms that mask it themselves (iOS, Android).
 * The scales put the 16-px grid on whole pixels: 180 × 0.8 = 144 = 9×, 192 × 0.75 = 144 = 9×,
 * 512 × 0.75 = 384 = 24×.
 */
const onGround = (imageScale) => ({
	type: IconTransformationType.Background,
	backgroundColor: GROUND,
	backgroundRadius: 0,
	imageScale,
	brightness: 1
});

const defaults = initFaviconIconSettings();
const settings = {
	// Browser tabs show the icon as drawn, on whatever the tab strip is.
	desktop: defaults.desktop,
	touch: { ...defaults.touch, icon: master, transformation: onGround(0.8), appTitle: 'Pixeli' },
	webAppManifest: {
		...defaults.webAppManifest,
		icon: master,
		transformation: onGround(0.75),
		name: 'Pixeli',
		shortName: 'Pixeli',
		backgroundColor: GROUND,
		themeColor: GROUND
	}
};

const files = await generateFaviconFiles({ icon: master }, { icon: settings, path: '/' }, adapter);
files['og-image.png'] = await sharp(Buffer.from(og)).png().toBuffer();
delete files['site.webmanifest'];

const written = Object.keys(files).toSorted();
for (const name of written) {
	const content = files[name];
	const bytes =
		typeof content === 'string'
			? content
			: content instanceof Blob
				? Buffer.from(await content.arrayBuffer())
				: content;
	writeFileSync(join(staticDir, name), bytes);
}
console.log(`static/: ${written.join(', ')}`);
