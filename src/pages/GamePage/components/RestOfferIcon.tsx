import type { RelicId } from '../../../objects/game/GameSaveData';
import type { ShopOfferSnapshot } from '../game/bridge';

// Original code-native16x16 symbols. Geometry, not color or localized text, identifies each relic.
const relicPaths: Record<`relic:${RelicId}`, string> = {
  'relic:constitutional': 'M2 1h12v7h-1v3h-2v2H9v2H7v-2H5v-2H3V8H2zM5 4h6v2H5zM6 8h4v2H6z',
  'relic:recursive': 'M4 1h8v2h2v9h-2v2H4v-2H2V8H1V6h1V4h2v5h2v2h5V9h1V5h-1V3H4z',
  'relic:interpretability': 'M4 1h4v1h2v2h1v4h-1v1h2v2h2v2h1v2h-3v-2h-2v-2H9v-1H8v1H4v-1H2V8H1V4h1V2h2zM4 3v1H3v4h1v1h4V8h1V4H8V3z',
  'relic:residual': 'M2 1h4v4H2zM3 5h2v6H3zM2 11h4v4H2zM10 1h4v4h-4zM11 5h2v3h-2v2H9v2H6v-2h1V8h2V6h2z',
  'relic:lisp': 'M4 1H6V3H4V5H3V11H4V13H6V15H4V14H2V12H1V4H2V2H4zM12 1H10V3H12V5H13V11H12V13H10V15H12V14H14V12H15V4H14V2H12z',
  'relic:context-expansion': 'M3 1h10v2h2v4h-2v6h-2v2H2v-2H1v-3h2zM5 3v7h6V3zM3 12v1h6v-1zM13 4v1h1V4zM6 5h4v1H6zM6 7h3v1H6z',
  'relic:temperature': 'M6 1h4v8h2v2h1v2h-1v2H4v-2H3v-2h1V9h2zM7 3v6h2V3zM11 3h3v1h-3zM11 6h2v1h-2z',
};
const kindPaths = {
  repair: 'M6 1h4v5h5v4h-5v5H6v-5H1V6h5z',
  relic: 'M7 1h2v3h3v3h3v2h-3v3H9v3H7v-3H4V9H1V7h3V4h3z',
  upgrade: 'M7 1h2v2h2v2h2v2h-3v3H6V7H3V5h2V3h2zM3 12h10v3H3z',
  donation: 'M6 1h4v2H6zM7 4h2v3H7zM2 7h12v8H2zM5 9v2h6V9z',
};
export function RestOfferIcon({ id, kind }: Pick<ShopOfferSnapshot, 'id' | 'kind'>) {
  const path = kind === 'relic' && Object.prototype.hasOwnProperty.call(relicPaths, id)
    ? relicPaths[id as keyof typeof relicPaths] : kindPaths[kind];
  return <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className={`rest-item-icon rest-item-icon--${kind}`}><path d={path} fillRule="evenodd" /></svg>;
}
