// Server-only barrel: reads the gallery from disk. Import it from `*.server.ts` files only.
export { gallery, summary, detail, facets } from './api/gallery.server';
export { fileEntries, serveFile } from './api/files.server';
