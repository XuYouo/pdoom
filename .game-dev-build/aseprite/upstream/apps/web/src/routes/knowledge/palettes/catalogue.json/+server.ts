import { json } from '@sveltejs/kit';
import { paletteCatalogue } from '#pages/knowledgePalettes/index.server.js';

export const prerender = true;

export const GET = () => json(paletteCatalogue());
