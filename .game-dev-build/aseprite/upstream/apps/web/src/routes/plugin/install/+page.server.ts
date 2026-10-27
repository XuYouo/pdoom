import { GITHUB_ISR } from '#shared/config/index.js';

export const prerender = false;
export const config = GITHUB_ISR;

export { load } from '#pages/pluginInstall/index.server.js';
