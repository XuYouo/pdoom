import { useEffect, useRef } from 'react';
import type { GameBridge } from '../game/bridge';
import { createGame } from '../game/config';

export function GameCanvas({ bridge }: { bridge: GameBridge }) {
  const parent = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let game: ReturnType<typeof createGame> | undefined;
    // Defer one frame so StrictMode's synthetic unmount cannot create two renderers.
    const frame = requestAnimationFrame(() => {
      if (parent.current) game = createGame(parent.current, bridge);
    });
    const observer = new ResizeObserver(() => { if (game?.isBooted) game.scale.refresh(); });
    if (parent.current) observer.observe(parent.current);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); game?.destroy(true); };
  }, [bridge]);
  return <div ref={parent} className="game-canvas" aria-label="Clawd 游戏画面，按 A D 移动、空格跳跃、J 攻击或鼠标瞄准；回形针工厂向上逃生，射击气泡解除定身" />;
}
