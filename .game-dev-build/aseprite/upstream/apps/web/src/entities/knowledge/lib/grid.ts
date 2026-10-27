import { escapeHtml } from './html';

/**
 * The ```grid pixel templates in `rules/*.md` (ADR-0011), drawn as inline SVG so the
 * knowledge base shows each one as the picture an agent would put on the canvas.
 *
 * The block format is the one `draw` op `grid` takes and `scripts/rule-templates.ts` parses:
 * legend lines `<glyph> = <role> #rrggbb`, a `---`, then one row of glyphs per pixel row, `.`
 * transparent. `tests/rules.test.ts` already holds every block to that format, so a template
 * this parser rejects is a broken rule file and fails the build rather than drawing wrong.
 */

export interface GridLegendEntry {
	glyph: string;
	role: string;
	hex: string;
}

export interface GridTemplate {
	name: string;
	legend: GridLegendEntry[];
	rows: string[][];
	width: number;
	height: number;
}

const LEGEND = /^(\S)\s*=\s*(.+?)\s+(#[0-9a-fA-F]{6})\s*$/;
const TRANSPARENT = '.';

export function parseGrid(name: string, body: string): GridTemplate {
	const lines = body.replace(/\s+$/, '').split(/\r?\n/);
	const split = lines.indexOf('---');
	if (split === -1) throw new Error(`grid '${name}': no '---' between the legend and the rows`);

	const legend = lines.slice(0, split).map((line) => {
		const match = LEGEND.exec(line);
		if (!match)
			throw new Error(`grid '${name}': legend line '${line}' is not '<glyph> = <role> #rrggbb'`);
		return { glyph: match[1]!, role: match[2]!, hex: match[3]!.toLowerCase() };
	});

	// Code points, not UTF-16 units, as the grid compiler counts them.
	const rows = lines.slice(split + 1).map((line) => Array.from(line));
	const width = rows[0]?.length ?? 0;
	if (rows.length === 0 || width === 0) throw new Error(`grid '${name}': no rows`);

	const known = new Set(legend.map((entry) => entry.glyph));
	rows.forEach((row, y) => {
		if (row.length !== width) {
			throw new Error(`grid '${name}': row ${y} has ${row.length} cells, row 0 has ${width}`);
		}
		for (const glyph of row) {
			if (glyph !== TRANSPARENT && !known.has(glyph)) {
				throw new Error(`grid '${name}': row ${y} uses '${glyph}', which is not in the legend`);
			}
		}
	});

	return { name, legend, rows, width, height: rows.length };
}

/** The largest whole-pixel scale that keeps the picture within a figure's width and height. */
function scaleFor(width: number, height: number): number {
	const maxWidth = 448;
	const maxHeight = 384;
	return Math.max(1, Math.min(12, Math.floor(maxWidth / width), Math.floor(maxHeight / height)));
}

/** One `<rect>` per horizontal run of a colour, not per pixel: a 64-wide row is a few runs. */
function svg(template: GridTemplate): string {
	const colour = new Map(template.legend.map((entry) => [entry.glyph, entry.hex]));
	const rects: string[] = [];
	template.rows.forEach((row, y) => {
		let x = 0;
		while (x < row.length) {
			const glyph = row[x]!;
			let end = x + 1;
			while (end < row.length && row[end] === glyph) end++;
			const fill = glyph === TRANSPARENT ? undefined : colour.get(glyph);
			if (fill)
				rects.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${fill}"/>`);
			x = end;
		}
	});
	const scale = scaleFor(template.width, template.height);
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${template.width} ${template.height}" ` +
		`width="${template.width * scale}" height="${template.height * scale}" shape-rendering="crispEdges" ` +
		`role="img" aria-label="Pixel template ${escapeHtml(template.name)}, ${template.width} by ${template.height} pixels">` +
		rects.join('') +
		`</svg>`
	);
}

/**
 * The template as a figure: the picture on Aseprite's transparency checkerboard, the legend as
 * swatches with each role, and the source behind a disclosure, so it can still be copied into
 * `draw` op `grid` exactly as written.
 */
export function gridFigure(name: string, body: string): string {
	const template = parseGrid(name, body);
	const legend = template.legend
		.map(
			(entry) =>
				`<li><span class="kb-swatch" style="background-color:${entry.hex}" aria-hidden="true"></span>` +
				`<code>${escapeHtml(entry.glyph)}</code> ${escapeHtml(entry.role)}</li>`
		)
		.join('');
	return (
		`<figure class="kb-grid">` +
		`<div class="kb-grid-art canvas-checker">${svg(template)}</div>` +
		`<figcaption><span class="kb-grid-name"><code>${escapeHtml(name)}</code> · ${template.width}×${template.height}</span>` +
		`<ul class="kb-grid-legend">${legend}</ul></figcaption>` +
		`<details><summary>Grid source</summary><pre><code>${escapeHtml(body.replace(/\s+$/, ''))}</code></pre></details>` +
		`</figure>`
	);
}
