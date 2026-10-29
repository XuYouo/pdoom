import * as Phaser from 'phaser';
import type { GameBridge } from './bridge';
import { WorldScene } from './scenes/WorldScene';

/** One instance per React mount. The owner must call game.destroy(true) in effect cleanup. */
export function createGame(parent: HTMLElement, bridge: GameBridge): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 640,
    height: 360,
    backgroundColor: '#101a1b',
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    banner: false,
    autoFocus: false,
    disableContextMenu: true,
    canvasStyle: 'display:block;image-rendering:pixelated;outline:none;',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, expandParent: false },
    fps: { target: 60, smoothStep: false },
    // Silent blockout: no unlicensed music, network, or auto-created WebAudio context.
    audio: { noAudio: true },
    input: { keyboard: true, mouse: true, touch: true, activePointers: 2 },
    // Collision/rewind are deterministic fixed-tick pure rules, not duplicate Arcade bodies.
    scene: [new WorldScene(bridge)],
  });
}

export default createGame;
