import { sitemapIndexXml } from '#pages/sitemap/index.server.js';

export const prerender = true;

export const GET = () =>
	new Response(sitemapIndexXml(), {
		headers: { 'Content-Type': 'application/xml; charset=utf-8' }
	});
