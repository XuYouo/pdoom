import type { Config } from '@sveltejs/adapter-vercel';

/**
 * Routes that show live GitHub numbers (/plugin, /plugin/install, the header's star count)
 * are not prerendered but cached on Vercel's CDN and re-rendered at most every two hours, all
 * with the same window so the page and the header agree. Under `vite dev` it is ignored.
 */
export const GITHUB_ISR: Config = { isr: { expiration: 2 * 60 * 60 } };
