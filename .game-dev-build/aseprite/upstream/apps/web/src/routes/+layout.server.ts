// The site is a static snapshot of the gallery folder at build time; nothing renders on request.
export const prerender = true;

export { load } from '#app-shell/layout/index.server.js';
