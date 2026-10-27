import { error } from '@sveltejs/kit';
import {
	LEADERBOARD_THEMES,
	leaderboardSvg,
	type LeaderboardTheme
} from '#pages/leaderboardImage/index.server.js';
import type { RequestHandler } from './$types';

// Prerendered like the rest of the site: the gallery only changes with a commit to `main`,
// and every such commit redeploys.
export const prerender = true;

export const entries = () => LEADERBOARD_THEMES.map((theme) => ({ theme }));

export const GET: RequestHandler = ({ params }) => {
	if (!LEADERBOARD_THEMES.includes(params.theme as LeaderboardTheme)) error(404, 'Not found');
	return new Response(leaderboardSvg(params.theme as LeaderboardTheme), {
		headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' }
	});
};
