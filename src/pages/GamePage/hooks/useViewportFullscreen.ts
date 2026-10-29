import { useCallback, useEffect, useState, type RefObject } from 'react';

/** Browser display state only. Window-filling gameplay does not depend on this optional API. */
export function useViewportFullscreen(target: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const sync = () => setActive(document.fullscreenElement === target.current);
    setSupported(document.fullscreenEnabled === true); sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, [target]);
  const toggle = useCallback(async () => {
    setMessage('');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (target.current && document.fullscreenEnabled) await target.current.requestFullscreen({ navigationUI: 'hide' });
      else setMessage('浏览器不支持全屏，可最大化窗口游玩。');
    } catch { setMessage('未能进入全屏，可继续在当前窗口游玩。'); }
  }, [target]);
  return { active, supported, message, toggle };
}
