import type { FileView } from '../model/types';

/** Human name of a file's role in a generation. */
export const roleLabel: Record<FileView['role'], string> = {
	cover: 'Cover',
	source: 'Aseprite source',
	animation: 'Animation',
	filmstrip: 'Filmstrip',
	sheet: 'Sprite sheet',
	frame: 'Frame',
	reference: 'Reference (concept / storyboard)',
	other: 'Other'
};
