// Inlined as data URLs: an SVG loaded through <img> (GitHub's README included) may not fetch
// anything, so a font it references by URL silently falls back to the reader's system font and
// every width computed below stops matching.
import retroFont from '@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2?inline';
import sansFont from '@fontsource-variable/pixelify-sans/files/pixelify-sans-latin-wght-normal.woff2?inline';
import { leaderboardView } from '#entities/benchmark/index.server.js';
import { gallery } from '#entities/generation/index.server.js';
import { SITE_URL } from '#shared/lib/site.js';

export const LEADERBOARD_THEMES = ['light', 'dark'] as const;
export type LeaderboardTheme = (typeof LEADERBOARD_THEMES)[number];

/** The site's own tokens (app/styles/index.css), copied because the image cannot read them. */
const PALETTES: Record<LeaderboardTheme, Record<string, string>> = {
	light: {
		card: '#ffffff',
		foreground: '#1b1824',
		track: '#d3cbdd',
		mutedForeground: '#5f5870',
		accent: '#ffa300',
		accentInk: '#9a5c00',
		border: '#ddd6e6',
		pixel: '#574c70'
	},
	dark: {
		card: '#1a1822',
		foreground: '#f1edf6',
		track: '#3a3449',
		mutedForeground: '#aaa3b9',
		accent: '#ffa300',
		accentInk: '#ffa300',
		border: '#2e2a3b',
		pixel: '#6a6080'
	}
};

// Press Start 2P is monospaced with a 1em advance, so a retro string is exactly
// `length × size` wide and columns can be laid out without measuring text.
const HEAD = 8;
const VALUE = 10;
const NAME = 18;
/** Pixelify Sans has no fixed advance; this over-estimates its widest lowercase run. */
const NAME_ADVANCE = 0.58;

const PAD = 24;
const GAP = 24;
const ROW = 40;
const SEGMENTS = 10;
const SEGMENT_WIDTH = 8;
const SEGMENT_GAP = 2;
const BORDER = 4;

function escapeXml(text: string): string {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;

/**
 * The benchmark leaderboard as a standalone SVG, for embedding where the site's page cannot go —
 * the README in particular. Same ranking and numbers as /benchmarks; prerendered, so it is as
 * current as the last deploy of `main`.
 */
export function leaderboardSvg(theme: LeaderboardTheme): string {
	const colors = PALETTES[theme];
	const { benchmarks, leaderboard } = gallery();
	const entries = leaderboardView(leaderboard);
	const total = benchmarks.length;

	const updated = entries
		.flatMap((entry) => entry.history.map((snapshot) => snapshot.date))
		.sort()
		.at(-1);

	const longestName = Math.max(0, ...entries.map((entry) => entry.modelLabel.length));
	const columns = [
		{ key: 'rank', head: '#', width: 3 * VALUE, align: 'start' },
		{
			key: 'model',
			head: 'MODEL',
			width: Math.max(5 * HEAD, Math.ceil(longestName * NAME_ADVANCE * NAME)),
			align: 'start'
		},
		{
			key: 'score',
			head: 'SCORE',
			width: 3 * VALUE + 10 + SEGMENTS * (SEGMENT_WIDTH + SEGMENT_GAP) - SEGMENT_GAP,
			align: 'start'
		},
		{ key: 'compliance', head: 'COMPLIANCE', width: 10 * HEAD, align: 'end' },
		{ key: 'craft', head: 'CRAFT', width: 5 * HEAD, align: 'end' },
		{ key: 'speed', head: 'SPEED', width: 5 * HEAD, align: 'end' },
		{ key: 'coverage', head: 'COVERAGE', width: 8 * HEAD, align: 'end' },
		{ key: 'runs', head: 'RUNS', width: 4 * HEAD, align: 'end' }
	] as const;

	const xs: number[] = [];
	let cursor = PAD;
	for (const column of columns) {
		xs.push(cursor);
		cursor += column.width + GAP;
	}
	const width = cursor - GAP + PAD;

	const titleY = PAD + 16;
	const headY = titleY + 36;
	const firstRowTop = headY + 12;
	const bodyHeight = Math.max(entries.length, 1) * ROW;
	const footY = firstRowTop + bodyHeight + 26;
	const height = footY + PAD - 6;

	const anchorX = (index: number) =>
		columns[index]!.align === 'end' ? xs[index]! + columns[index]!.width : xs[index]!;
	const anchor = (index: number) => (columns[index]!.align === 'end' ? 'end' : 'start');

	const heads = columns
		.map(
			(column, index) =>
				`<text x="${anchorX(index)}" y="${headY}" text-anchor="${anchor(index)}" class="retro head">${column.head}</text>`
		)
		.join('');

	const rows = entries
		.map((entry, rank) => {
			const top = firstRowTop + rank * ROW;
			const baseline = top + ROW / 2 + VALUE / 2;
			const points = Math.round(entry.score);
			const filled = Math.round((points / 100) * SEGMENTS);
			const barX = xs[2]! + 3 * VALUE + 10;
			const segments = Array.from({ length: SEGMENTS }, (_, index) => {
				const x = barX + index * (SEGMENT_WIDTH + SEGMENT_GAP);
				return `<rect x="${x}" y="${top + ROW / 2 - 5}" width="${SEGMENT_WIDTH}" height="10" fill="${index < filled ? colors.accent : colors.track}"/>`;
			}).join('');
			const cell = (index: number, text: string, extra = '') =>
				`<text x="${anchorX(index)}" y="${baseline}" text-anchor="${anchor(index)}" class="retro value"${extra}>${text}</text>`;
			return [
				rank > 0
					? `<rect x="${PAD}" y="${top}" width="${width - 2 * PAD}" height="2" fill="${colors.border}"/>`
					: '',
				cell(0, String(rank + 1), rank === 0 ? ` fill="${colors.accentInk}"` : ''),
				`<text x="${xs[1]}" y="${top + ROW / 2 + 6}" class="name">${escapeXml(entry.modelLabel)}</text>`,
				`<text x="${xs[2]! + 3 * VALUE}" y="${baseline}" text-anchor="end" class="retro value">${points}</text>`,
				segments,
				cell(3, percent(entry.compliance)),
				cell(4, percent(entry.craft)),
				cell(5, percent(entry.speed)),
				cell(6, `${entry.benchmarks}/${total}`),
				cell(7, String(entry.runs))
			].join('');
		})
		.join('');

	const empty =
		entries.length === 0
			? `<text x="${PAD}" y="${firstRowTop + ROW / 2 + 6}" class="name muted">No model has been ranked yet.</text>`
			: '';

	const host = SITE_URL.replace(/^https?:\/\//, '');
	const meta = [`${total} benchmarks`, updated ? `updated ${updated}` : null]
		.filter(Boolean)
		.join(' · ');

	// The frame is the site's notched pixel border: a 4px outline with each corner pixel cut away.
	const notch = BORDER;
	const frame = `<path fill="${colors.pixel}" fill-rule="evenodd" d="M${notch} 0H${width - notch}V${notch}H${width}V${height - notch}H${width - notch}V${height}H${notch}V${height - notch}H0V${notch}H${notch}Z M${BORDER} ${BORDER}V${height - BORDER}H${width - BORDER}V${BORDER}Z"/>`;

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges" role="img" aria-labelledby="title">
<title id="title">AI pixel art leaderboard: ${escapeXml(
		entries
			.map((entry, rank) => `${rank + 1}. ${entry.modelLabel} ${Math.round(entry.score)}`)
			.join(', ') || 'no model ranked yet'
	)}</title>
<style>
@font-face{font-family:'Press Start 2P';src:url(${retroFont}) format('woff2');}
@font-face{font-family:'Pixelify Sans';font-weight:400 700;src:url(${sansFont}) format('woff2');}
.retro{font-family:'Press Start 2P',monospace;}
.head{font-size:${HEAD}px;fill:${colors.mutedForeground};}
.value{font-size:${VALUE}px;fill:${colors.foreground};}
.name{font-family:'Pixelify Sans',sans-serif;font-size:${NAME}px;font-weight:500;fill:${colors.foreground};}
.muted{fill:${colors.mutedForeground};}
.small{font-family:'Pixelify Sans',sans-serif;font-size:14px;fill:${colors.mutedForeground};}
</style>
<rect x="${BORDER}" y="${BORDER}" width="${width - 2 * BORDER}" height="${height - 2 * BORDER}" fill="${colors.card}"/>
${frame}
<svg x="${PAD - 2}" y="${titleY - 18}" width="24" height="24" viewBox="0 0 24 24"><path fill="${colors.accentInk}" d="M16 17h-3v2h2v2H9v-2h2v-2H8v-2h8zm2-12h4v6h-2V7h-2v4h2v2h-2v2h-2V5H8v10H6v-2H4v-2h2V7H4v4H2V5h4V3h12z"/></svg>
<text x="${PAD + 32}" y="${titleY}" class="retro" font-size="14" fill="${colors.foreground}">Leaderboard</text>
<text x="${width - PAD}" y="${titleY - 1}" text-anchor="end" class="small">${meta}</text>
${heads}
<rect x="${PAD}" y="${headY + 8}" width="${width - 2 * PAD}" height="2" fill="${colors.border}"/>
${rows}${empty}
<rect x="${PAD}" y="${firstRowTop + bodyHeight}" width="${width - 2 * PAD}" height="2" fill="${colors.border}"/>
<text x="${PAD}" y="${footY}" class="small">Score 0–100: 35% criteria · 50% craft · 15% speed</text>
<text x="${width - PAD}" y="${footY}" text-anchor="end" class="small">${host}/benchmarks</text>
</svg>
`;
}
