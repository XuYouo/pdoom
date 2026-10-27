import { starsResponse } from '#app-shell/layout/index.server.js';
import { GITHUB_ISR } from '#shared/config/index.js';

export const prerender = false;
export const config = GITHUB_ISR;

export const GET = starsResponse;
