// steiger 0.7's cosmiconfig loader cannot load this file as ESM (it imports from
// `@feature-sliced/steiger-plugin`, whose exports map has no main entry). But it can read
// .mjs fine, and .mjs supports top-level await — so we use that to wait for the dynamic
// import before module.exports is read.
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const mod = await import(
	pathToFileURL(path.join(here, 'node_modules/@feature-sliced/steiger-plugin/dist/index.js')).href
);
const fsd = mod.default;
const [pluginDef, rulesConfig] = fsd.configs.recommended;
const overrides = { ...rulesConfig.rules, 'fsd/typo-in-layer-name': 'off' };
export default [
	pluginDef,
	{ rules: overrides },
	{ ignores: ['**/routes/**', '**/lib/assets/**', '**/app/app.d.ts', '**/app/app.html'] }
];
