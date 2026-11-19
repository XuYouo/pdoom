const glyphs: Record<string, string[]> = {
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  '(': ['001', '010', '100', '100', '100', '010', '001'],
  ')': ['100', '010', '001', '001', '001', '010', '100'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '%': ['11001', '11001', '00010', '00100', '01000', '10011', '10011'],
};

function wordPath(word: string) {
  let offset = 0;
  return [...word].map(character => {
    const rows = glyphs[character];
    const path = rows.flatMap((row, y) => [...row].map((pixel, x) => pixel === '1' ? `M${offset + x},${y}h1v1h-1z` : '')).join('');
    offset += rows[0].length + 1;
    return path;
  }).join('');
}

const title = wordPath('P(DOOM)'), probability = wordPath('100%');

/** Fixed, original bitmap lettering; the surrounding h1 supplies accessible text. */
export function PixelWordmark() {
  return <svg className="pixel-wordmark" viewBox="-1 -1 40 24" aria-hidden="true" focusable="false" shapeRendering="crispEdges">
    <g transform="translate(0 1)" fill="#060d10" stroke="#060d10" strokeWidth="0.6"><path d={title} /><path d={probability} transform="translate(0 11) scale(1.55)" /></g>
    <path d={title} fill="currentColor" />
    <path className="pixel-wordmark-probability" d={probability} transform="translate(0 11) scale(1.55)" />
  </svg>;
}
