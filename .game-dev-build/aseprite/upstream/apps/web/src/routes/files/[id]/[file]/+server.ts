import { fileEntries, serveFile } from '#entities/generation/index.server.js';
import type { RequestHandler } from './$types';

// Local file serving for `vite dev` and fixture builds. A production build links
// to the files on GitHub instead, `entries` is empty, and nothing is emitted here
// (see entities/generation/api/files.server.ts).
export const prerender = true;

export const entries = fileEntries;

export const GET: RequestHandler = ({ params }) => serveFile(params.id, params.file);
