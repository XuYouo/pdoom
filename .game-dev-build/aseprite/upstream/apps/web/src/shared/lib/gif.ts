// A GIF decoder small enough to read: every frame composited to full-canvas RGBA, with its
// delay. Browsers play a GIF on their own clock with no way to seek or retime it; decoding it
// here is what lets a page play two GIFs of different lengths over the same span of time.

export interface GifFrame {
	/** Full-canvas RGBA after this frame's disposal rules of the previous frame were applied. */
	pixels: Uint8ClampedArray<ArrayBuffer>;
	/** Milliseconds, as browsers play it: a delay of 10 ms or less is shown for 100 ms. */
	delay: number;
}

export interface Gif {
	width: number;
	height: number;
	frames: GifFrame[];
	/** Sum of every frame's delay: one loop, in milliseconds. */
	duration: number;
}

/**
 * LZW-decode one image's data sub-blocks into colour indices. `written` is how many leading
 * indices are real: truncated data leaves the rest zero-filled, which must not paint as colour 0.
 */
function lzw(data: Uint8Array, minCodeSize: number, pixelCount: number): { indices: Uint8Array; written: number } {
	const out = new Uint8Array(pixelCount);
	const clear = 1 << minCodeSize;
	const end = clear + 1;
	// Dictionary as prefix links + suffix bytes: each entry is (prefix code, last byte).
	const prefix = new Int32Array(4096);
	const suffix = new Uint8Array(4096);
	const length = new Int32Array(4096);
	for (let i = 0; i < clear; i++) {
		prefix[i] = -1;
		suffix[i] = i;
		length[i] = 1;
	}
	let size = minCodeSize + 1;
	let next = end + 1;
	let previous = -1;
	let written = 0;
	let bits = 0;
	let buffer = 0;
	let pos = 0;

	const emit = (code: number) => {
		const n = length[code]!;
		let at = written + n - 1;
		for (let c = code; c !== -1; c = prefix[c]!) {
			if (at < pixelCount) out[at] = suffix[c]!;
			at--;
		}
		written += n;
	};
	const firstByte = (code: number) => {
		let c = code;
		while (prefix[c] !== -1) c = prefix[c]!;
		return suffix[c]!;
	};

	while (written < pixelCount) {
		while (bits < size) {
			if (pos >= data.length) return { indices: out, written: Math.min(written, pixelCount) };
			buffer |= data[pos++]! << bits;
			bits += 8;
		}
		const code = buffer & ((1 << size) - 1);
		buffer >>>= size;
		bits -= size;

		if (code === clear) {
			size = minCodeSize + 1;
			next = end + 1;
			previous = -1;
			continue;
		}
		if (code === end) break;

		if (previous === -1) {
			emit(code);
		} else if (code < next) {
			emit(code);
			if (next < 4096) {
				prefix[next] = previous;
				suffix[next] = firstByte(code);
				length[next] = length[previous]! + 1;
				next++;
			}
		} else {
			// The KwKwK case: the code being defined right now.
			if (next < 4096) {
				prefix[next] = previous;
				suffix[next] = firstByte(previous);
				length[next] = length[previous]! + 1;
				next++;
			}
			emit(code);
		}
		previous = code;
		if (next === 1 << size && size < 12) size++;
	}
	return { indices: out, written: Math.min(written, pixelCount) };
}

export function decodeGif(bytes: Uint8Array): Gif {
	const view = bytes;
	const signature = String.fromCharCode(...view.subarray(0, 6));
	if (signature !== 'GIF87a' && signature !== 'GIF89a') throw new Error('Not a GIF file');

	const width = view[6]! | (view[7]! << 8);
	const height = view[8]! | (view[9]! << 8);
	const packed = view[10]!;
	let pos = 13;
	let globalTable: Uint8Array | null = null;
	if (packed & 0x80) {
		const size = 3 * (1 << ((packed & 0x07) + 1));
		globalTable = view.subarray(pos, pos + size);
		pos += size;
	}

	const canvas = new Uint8ClampedArray(width * height * 4);
	const frames: GifFrame[] = [];
	let delay = 0;
	let transparent = -1;
	let disposal = 0;

	const readSubBlocks = (): Uint8Array => {
		const chunks: Uint8Array[] = [];
		let total = 0;
		for (let n = view[pos++]!; n > 0; n = view[pos++]!) {
			chunks.push(view.subarray(pos, pos + n));
			total += n;
			pos += n;
		}
		const joined = new Uint8Array(total);
		let at = 0;
		for (const chunk of chunks) {
			joined.set(chunk, at);
			at += chunk.length;
		}
		return joined;
	};

	while (pos < view.length) {
		const block = view[pos++]!;
		if (block === 0x3b) break;
		if (block === 0x21) {
			const label = view[pos++]!;
			if (label === 0xf9) {
				// Graphic Control Extension: delay, transparency, disposal for the next image.
				const flags = view[pos + 1]!;
				disposal = (flags >> 2) & 0x07;
				delay = (view[pos + 2]! | (view[pos + 3]! << 8)) * 10;
				transparent = flags & 0x01 ? view[pos + 4]! : -1;
				pos += 6; // size byte, 4 data bytes, terminator
			} else {
				readSubBlocks();
			}
			continue;
		}
		if (block !== 0x2c) throw new Error(`Corrupt GIF: unexpected block 0x${block.toString(16)}`);

		if (pos + 9 > view.length) break; // truncated image header
		const left = view[pos]! | (view[pos + 1]! << 8);
		const top = view[pos + 2]! | (view[pos + 3]! << 8);
		const w = view[pos + 4]! | (view[pos + 5]! << 8);
		const h = view[pos + 6]! | (view[pos + 7]! << 8);
		const flags = view[pos + 8]!;
		pos += 9;
		let table = globalTable;
		if (flags & 0x80) {
			const size = 3 * (1 << ((flags & 0x07) + 1));
			table = view.subarray(pos, pos + size);
			pos += size;
		}
		const interlaced = (flags & 0x40) !== 0;
		const minCodeSize = view[pos++]!;
		const { indices, written } = lzw(readSubBlocks(), minCodeSize, w * h);
		if (!table) throw new Error('Corrupt GIF: no colour table');
		// An image with no decodable data would be a blank frame that still takes up loop time.
		if (written === 0) {
			delay = 0;
			transparent = -1;
			disposal = 0;
			continue;
		}

		// Disposal 3 restores what was there before this frame was drawn.
		const restore = disposal === 3 ? canvas.slice() : null;
		const rows = interlaced ? interlacedRows(h) : null;
		for (let i = 0; i < written; i++) {
			const index = indices[i]!;
			// A palette entry the table is too short to hold stays transparent, not black.
			if (index === transparent || index * 3 + 2 >= table.length) continue;
			const row = rows ? rows[Math.floor(i / w)]! : Math.floor(i / w);
			const x = left + (i % w);
			const y = top + row;
			if (x >= width || y >= height) continue;
			const at = (y * width + x) * 4;
			canvas[at] = table[index * 3]!;
			canvas[at + 1] = table[index * 3 + 1]!;
			canvas[at + 2] = table[index * 3 + 2]!;
			canvas[at + 3] = 255;
		}
		frames.push({ pixels: canvas.slice(), delay: delay <= 10 ? 100 : delay });

		if (disposal === 2) {
			for (let y = top; y < Math.min(height, top + h); y++) {
				canvas.fill(0, (y * width + left) * 4, (y * width + Math.min(width, left + w)) * 4);
			}
		} else if (restore) {
			canvas.set(restore);
		}
		delay = 0;
		transparent = -1;
		disposal = 0;
	}

	if (frames.length === 0) throw new Error('GIF has no frames');
	return { width, height, frames, duration: frames.reduce((sum, frame) => sum + frame.delay, 0) };
}

/** Row order of an interlaced image: every 8th from 0, every 8th from 4, every 4th from 2, every 2nd from 1. */
function interlacedRows(height: number): number[] {
	const rows: number[] = [];
	for (const [start, step] of [
		[0, 8],
		[4, 8],
		[2, 4],
		[1, 2]
	] as const) {
		for (let y = start; y < height; y += step) rows.push(y);
	}
	return rows;
}

/** Index of the frame showing at `time` ms into the loop. */
export function frameAt(gif: Gif, time: number): number {
	let t = ((time % gif.duration) + gif.duration) % gif.duration;
	for (let i = 0; i < gif.frames.length; i++) {
		t -= gif.frames[i]!.delay;
		if (t < 0) return i;
	}
	return gif.frames.length - 1;
}
