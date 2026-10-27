import { renderedMarkdown } from '#shared/api/index.server.js';
import type { PluginInstallPageData } from '../model/types';

export async function load(): Promise<PluginInstallPageData> {
	return { guide: await renderedMarkdown('docs/INSTALL.md', { 'README.md': '/plugin' }) };
}
