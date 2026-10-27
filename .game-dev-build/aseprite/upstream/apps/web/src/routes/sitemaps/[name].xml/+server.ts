import { sitemapNames, sitemapXml } from '#pages/sitemap/index.server.js';
import type { RequestHandler } from './$types';

export const prerender = true;

export const entries = () => sitemapNames().map((name) => ({ name }));

export const GET: RequestHandler = ({ params }) =>
	new Response(sitemapXml(params.name), {
		headers: { 'Content-Type': 'application/xml; charset=utf-8' }
	});
