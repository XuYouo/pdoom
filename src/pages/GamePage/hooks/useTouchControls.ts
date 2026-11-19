import { useEffect, useState } from 'react';

export function hasTouchCapability() {
  if (typeof window === 'undefined') return false;
  return (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) || window.matchMedia?.('(any-pointer: coarse)').matches === true;
}

/** Capability changes only; pointer motion never enters React state. */
export function useTouchControls(): boolean {
  const [hasTouchControls, setHasTouchControls] = useState(hasTouchCapability);
  useEffect(() => {
    const media = window.matchMedia?.('(any-pointer: coarse)');
    const changed = () => setHasTouchControls(hasTouchCapability());
    changed();
    media?.addEventListener('change', changed);
    window.addEventListener('pageshow', changed);
    return () => { media?.removeEventListener('change', changed); window.removeEventListener('pageshow', changed); };
  }, []);
  return hasTouchControls;
}
