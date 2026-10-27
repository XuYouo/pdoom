import { readFileSync } from 'node:fs';
import { dev } from '$app/env';
import { resolve } from '$app/paths';
import { error } from '@sveltejs/kit';
import { gallery } from './gallery.server';

/**
 * Where gallery files are served from. A production build links straight to the
 * files in the repository on GitHub, pinned to the commit being deployed, so the
 * deployment carries no copy of them: a gallery of large GIFs and .aseprite
 * sources would otherwise be duplicated into every Vercel build. `vite dev` and
 * fixture builds (`GALLERY_FILES=local`) serve the local files instead — those
 * are not on GitHub yet.
 */
const servesLocally = dev || process.env.GALLERY_FILES === 'local';

const REMOTE_REF = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GALLERY_FILES_REF || 'main';
const REMOTE_BASE = `https://raw.githubusercontent.com/with-pebbly/aseprite-ai-artist/${REMOTE_REF}/gallery/generations`;

/** The URL a page links to for one gallery file. */
export function fileUrl(id: string, path: string): string {
	return servesLocally
		? resolve('/files/[id]/[file]', { id, file: path })
		: `${REMOTE_BASE}/${encodeURIComponent(id)}/${encodeURIComponent(path)}`;
}

const contentTypes: Record<string, string> = {
	png: 'image/png',
	gif: 'image/gif',
	webp: 'image/webp',
	json: 'application/json',
	aseprite: 'application/octet-stream',
	ase: 'application/octet-stream'
};

/**
 * Every gallery file the local endpoint must prerender — none when files are
 * linked from GitHub, so a production build emits no copies.
 */
export const fileEntries = () =>
	servesLocally
		? gallery().generations.flatMap((generation) =>
				generation.files.map((file) => ({ id: generation.id, file: file.path }))
			)
		: [];

/** The bytes of one gallery file, for `vite dev` and local fixture builds. */
export function serveFile(id: string, path: string): Response {
	const generation = gallery().generations.find((candidate) => candidate.id === id);
	const file = generation?.files.find((candidate) => candidate.path === path);
	if (!file) error(404, 'No such file in the gallery');
	return new Response(readFileSync(file.absolutePath), {
		headers: {
			'content-type': contentTypes[file.extension] ?? 'application/octet-stream',
			'content-length': String(file.bytes)
		}
	});
}
