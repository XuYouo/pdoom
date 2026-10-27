import { closeSync, openSync, readSync } from 'node:fs';

/**
 * Reads the pixel size from a PNG, GIF or WebP header. Used by `entities/generation` to give
 * pages the native size, so cards can render at integer multiples and the cover never resamples.
 */
export function imageSize(path: string): { width: number; height: number } | null {
	const head = Buffer.alloc(32);
	const fd = openSync(path, 'r');
	let read: number;
	try {
		read = readSync(fd, head, 0, head.length, 0);
	} finally {
		closeSync(fd);
	}
	if (read < 24) return null;

	if (head.readUInt32BE(0) === 0x89504e47) {
		return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
	}
	if (head.toString('latin1', 0, 4) === 'GIF8') {
		return { width: head.readUInt16LE(6), height: head.readUInt16LE(8) };
	}
	if (head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP') {
		const chunk = head.toString('latin1', 12, 16);
		if (chunk === 'VP8X' && read >= 30) {
			return { width: 1 + head.readUIntLE(24, 3), height: 1 + head.readUIntLE(27, 3) };
		}
		if (chunk === 'VP8L' && read >= 25) {
			const bits = head.readUInt32LE(21);
			return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
		}
		if (chunk === 'VP8 ' && read >= 30) {
			return { width: head.readUInt16LE(26) & 0x3fff, height: head.readUInt16LE(28) & 0x3fff };
		}
	}
	return null;
}
