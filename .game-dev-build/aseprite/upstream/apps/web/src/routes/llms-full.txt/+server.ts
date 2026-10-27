import { llmsFullTxt } from '#pages/llms/index.server.js';

export const prerender = true;

export const GET = () =>
	new Response(llmsFullTxt(), { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
