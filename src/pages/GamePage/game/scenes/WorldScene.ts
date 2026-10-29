import * as Phaser from 'phaser';
import type { GameCommand, GameBridge } from '../bridge';
import { PREVIEW_SAVE, TUNING } from '../data/chapterOne';
import { CLAWD_FORMS, clawdTexture } from '../data/clawdAssets';
import { ENEMY_ASSETS, type EnemySpriteKind } from '../data/enemyAssets';
import { BOSS_ASSETS } from '../data/bossAssets';
import { ENVIRONMENT_ASSETS } from '../data/environmentAssets';
import { PROBE_ASSET } from '../data/probeAssets';
import type { BehaviorMemory, WorldState } from '../entities/model';
import { CheckpointMemoryCache } from '../systems/runMemory';
import { cloneBehavior } from '../systems/behavior';
import { omegaHudSnapshot } from '../systems/omegaPresentation';
import { InputSystem } from '../systems/InputSystem';
import { loomHudSnapshot, worldObjective } from '../systems/presentation';
import { AudioSystem } from '../audio/AudioSystem';
import { DEFAULT_AUDIO_PREFERENCES, normalizePreferences } from '../audio/types';
import { createWorld, stepWorld } from '../systems/simulation';
import { WorldRenderer } from '../systems/WorldRenderer';
import { contextSnapshot } from '../systems/context';
import { applyProgressionCommand, restSnapshot } from '../systems/shop';

/** Thin lifecycle/bridge adapter. Simulation has no React, persistence, timers or browser dependencies. */
export class WorldScene extends Phaser.Scene {
  private world: WorldState;
  private controls: InputSystem;
  private view: WorldRenderer;
  private audio: AudioSystem;
  private audioPreferences = { ...DEFAULT_AUDIO_PREFERENCES };
  private paused = false;
  private accumulator = 0;
  private lastHudAt = -Infinity;
  private unsubscribe: (() => void) | undefined;
  private cleaned = false;
  private checkpointMemory = new CheckpointMemoryCache<BehaviorMemory>(cloneBehavior);

  constructor(private bridge: GameBridge) { super({ key: 'world' }); }

  preload() {
    for (const form of CLAWD_FORMS) {
      const key = clawdTexture(form);
      this.load.atlas(key, `game/${key}.png`, `game/${key}.json`);
    }
    for (const asset of ENEMY_ASSETS) this.load.atlas(asset.key, asset.image, asset.atlas);
    for (const asset of BOSS_ASSETS) this.load.atlas(asset.key, asset.image, asset.atlas);
    this.load.atlas(PROBE_ASSET.key, PROBE_ASSET.image, PROBE_ASSET.atlas);
    for (const asset of ENVIRONMENT_ASSETS) {
      if (asset.load === 'atlas') this.load.atlas(asset.key, asset.image, asset.atlas);
      else this.load.spritesheet(asset.key, asset.image, { frameWidth: asset.frameWidth, frameHeight: asset.frameHeight, margin: asset.margin, spacing: asset.spacing, startFrame: asset.startFrame, endFrame: asset.endFrame });
    }
  }

  create() {
    if (CLAWD_FORMS.some(form => !this.textures.exists(clawdTexture(form)))) {
      this.bridge.emit({ type: 'load-failed', message: 'Clawd 角色资源加载失败。请检查网络后刷新页面；本地检查点未改动。' });
      return;
    }
    const missingEnemy = ENEMY_ASSETS.find(asset => !this.textures.exists(asset.key) || asset.frames.some(frame => !this.textures.get(asset.key).has(frame)));
    if (missingEnemy) {
      const labels: Readonly<Record<EnemySpriteKind, string>> = { parrot: '随机鹦鹉', repeater: '复读机', deceiver: '伪装者' };
      this.bridge.emit({ type: 'load-failed', message: `${labels[missingEnemy.kind]}图集加载失败。请检查网络后刷新页面；本地检查点未改动。` });
      return;
    }
    const missingBoss = BOSS_ASSETS.find(asset => !this.textures.exists(asset.key) || asset.frames.some(frame => !this.textures.get(asset.key).has(frame)));
    if (missingBoss) {
      this.bridge.emit({ type: 'load-failed', message: 'Gato 三形态图集加载失败。请检查网络后刷新页面；本地检查点未改动。' });
      return;
    }
    const missingEnvironment = ENVIRONMENT_ASSETS.some(asset => !this.textures.exists(asset.key) || asset.frames.some(name => {
      const texture = this.textures.get(asset.key);
      if (!texture.has(String(name))) return true;
      const frame = texture.get(String(name));
      return frame.trimmed || frame.rotated || !frame.source || frame.cutWidth !== asset.frameWidth || frame.cutHeight !== asset.frameHeight
        || frame.width !== asset.frameWidth || frame.height !== asset.frameHeight || frame.realWidth !== asset.frameWidth || frame.realHeight !== asset.frameHeight
        || frame.cutX < 0 || frame.cutY < 0 || frame.cutX + frame.cutWidth > frame.source.width || frame.cutY + frame.cutHeight > frame.source.height;
    }));
    if (missingEnvironment) {
      this.bridge.emit({ type: 'load-failed', message: '第一章地形与场景资源加载失败。请检查网络后刷新页面；本地检查点未改动。' });
      return;
    }
    const missingProbe = !this.textures.exists(PROBE_ASSET.key) || PROBE_ASSET.frames.some(name => {
      const texture = this.textures.get(PROBE_ASSET.key);
      if (!texture.has(String(name))) return true;
      const frame = texture.get(String(name));
      return frame.trimmed || frame.rotated || frame.x !== 0 || frame.y !== 0 || !frame.source
        || frame.cutWidth !== 32 || frame.cutHeight !== 32 || frame.width !== 32 || frame.height !== 32 || frame.realWidth !== 32 || frame.realHeight !== 32
        || ![frame.cutX, frame.cutY, frame.source.width, frame.source.height].every(Number.isSafeInteger)
        || frame.cutX < 0 || frame.cutY < 0 || frame.cutX + 32 > frame.source.width || frame.cutY + 32 > frame.source.height;
    });
    if (missingProbe) {
      this.bridge.emit({ type: 'load-failed', message: '冯·诺依曼探针图集加载失败。请检查网络后刷新页面；本地检查点未改动。' });
      return;
    }
    this.cleaned = false; this.paused = false; this.accumulator = 0; this.lastHudAt = -Infinity;
    this.world = createWorld(PREVIEW_SAVE, 'ready');
    this.audio = new AudioSystem(status => {
      if (!this.cleaned) this.bridge.emit({ type: 'audio-status', status });
    });
    this.syncAudio();
    this.view = new WorldRenderer(this);
    this.controls = new InputSystem(this, this.requestPause);
    this.view.draw(this.world, 0, true);
    this.unsubscribe = this.bridge.onCommand(this.command);
    this.game.events.on(Phaser.Core.Events.BLUR, this.requestPause);
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.requestPause);
    this.game.renderer.on(Phaser.Renderer.Events.LOSE_WEBGL, this.requestPause);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
    this.emitHud(true);
    this.emitContext();
    // No actors run before React sends start/restart; preview and listener are now ready.
    this.bridge.emit({ type: 'ready' });
  }

  update(_time: number, delta: number) {
    if (this.cleaned || !this.world || this.world.mode !== 'playing' || this.paused) return;
    this.controls.poll();
    if (this.paused) return;
    this.accumulator += Math.min(delta, 100);
    while (this.accumulator >= TUNING.stepMs && this.world.mode === 'playing') {
      this.world = stepWorld(this.world, this.controls.consume());
      this.syncAudio();
      this.accumulator -= TUNING.stepMs;
      this.emitWorldEvents();
    }
    this.view.draw(this.world, Math.min(delta, 100));
    this.emitHud();
    if (this.world.mode !== 'playing') this.controls.setEnabled(false);
  }

  private command = (command: GameCommand) => {
    if (this.cleaned) return;
    switch (command.type) {
      case 'start':
      case 'restart':
        this.world = createWorld(command.save, 'playing', this.checkpointMemory.restore(command.save));
        this.checkpointMemory.store(command.save, this.world.behavior);
        this.paused = false; this.accumulator = 0; this.lastHudAt = -Infinity;
        this.syncAudio();
        // A completed-save replay has no active score or simulation to unlock; settings still offer explicit audio control.
        if (this.world.mode === 'playing' || this.world.mode === 'rest') void this.audio.unlock();
        this.controls.setEnabled(this.world.mode === 'playing');
        this.view.draw(this.world, 0, true);
        this.emitWorldEvents(); this.emitHud(true); this.emitContext();
        break;
      case 'pause': this.setPaused(true); break;
      case 'resume':
        this.setPaused(false);
        if (this.world.mode === 'playing' && !this.paused) void this.audio.unlock();
        break;
      case 'rewind': this.controls.queue('rewind'); break;
      case 'insight': this.controls.queue('insight'); break;
      case 'reroll': this.controls.queue('reroll'); break;
      case 'set-muted':
        this.audioPreferences = { ...this.audioPreferences, muted: command.muted };
        this.audio.setPreferences(this.audioPreferences);
        break;
      case 'set-audio':
        this.audioPreferences = normalizePreferences(command);
        this.audio.setPreferences(this.audioPreferences);
        if (command.unlock) void this.audio.unlock();
        break;
      case 'request-context': this.emitContext(); break;
      case 'shop-buy':
      case 'shop-hack':
      case 'context-reorder':
      case 'rest-continue':
        this.world = applyProgressionCommand(this.world, command);
        this.accumulator = 0;
        if (command.type === 'rest-continue' && this.world.mode === 'playing') this.paused = false;
        this.syncAudio();
        if (command.type === 'rest-continue' && this.world.mode === 'playing') void this.audio.unlock();
        this.controls.setEnabled(this.world.mode === 'playing' && !this.paused);
        this.emitWorldEvents(); this.emitHud(true);
        this.view.draw(this.world, 0);
        break;
    }
  };

  private requestPause = () => {
    if (this.cleaned || this.world.mode !== 'playing' || this.paused) return;
    this.setPaused(true);
    this.bridge.emit({ type: 'pause-requested' });
  };

  private setPaused(paused: boolean) {
    if (this.world.mode !== 'playing' || this.paused === paused) return;
    this.paused = paused; this.accumulator = 0;
    this.syncAudio(); // Must run here: paused scenes no longer reach update().
    this.controls.setEnabled(!paused);
    // Save only at authored checkpoints: serializing mid-segment rewards without pickup IDs
    // would allow reload/recollect farming, since the DTO deliberately stores no world entities.
    this.emitHud(true);
  }

  private syncAudio() {
    if (!this.audio || !this.world) return;
    const { save, boss, loom, chapter, mode } = this.world;
    this.audio.update({
      runId: save.runId, stage: chapter.stage, doom: save.doom,
      bossActive: boss.active && boss.hp > 0,
      running: mode === 'playing' && !this.paused && !this.cleaned,
      elapsedMs: save.elapsedMs, hp: save.hp,
      shots: save.actionCounts.shots, rewinds: save.actionCounts.rewinds,
      rerolls: loom?.rerolls ?? 0, turns: loom?.turn.successes ?? 0, stemsLost: loom?.stemsLost ?? 0,
    });
  }

  private emitWorldEvents() {
    this.world.events.forEach(event => {
      switch (event.type) {
        case 'impact': this.cameras.main.shake(90, event.strength); break;
        case 'defeat':
          this.emitHud(true);
          this.bridge.emit({ type: 'ended', result: { save: event.save, ending: 'defeat' } });
          break;
        case 'victory':
          this.checkpointMemory.store(event.result.save, this.world.behavior);
          this.emitHud(true); // Deliver the final snapshot before React rejects later stale combat events.
          this.bridge.emit({ type: 'ended', result: event.result });
          break;
        case 'context-changed': this.emitContext(); break;
        case 'rest-opened':
        case 'rest-updated': {
          const snapshot = restSnapshot(this.world);
          if (snapshot) this.bridge.emit({ type: event.type, snapshot });
          break;
        }
        case 'rest-closed': this.bridge.emit({ type: 'rest-closed' }); break;
        case 'checkpoint':
        case 'stage-cleared':
          this.checkpointMemory.store(event.save, this.world.behavior);
          this.bridge.emit(event);
          break;
        case 'notice': this.bridge.emit(event); break;
      }
    });
  }

  private emitContext() {
    this.bridge.emit({ type: 'context', snapshot: contextSnapshot(this.world.save, this.world.mode === 'rest') });
  }

  private emitHud(force = false) {
    const { save, player, boss, mode } = this.world;
    if (!force && save.elapsedMs - this.lastHudAt < 200 && mode === 'playing') return;
    this.lastHudAt = save.elapsedMs;
    this.bridge.emit({ type: 'hud', snapshot: {
      hp: save.hp, doom: save.doom, tokens: save.tokens, score: save.score, stage: save.stage,
      elapsedMs: Math.floor(save.elapsedMs), rewindReady: !this.world.rewind && save.elapsedMs >= player.rewindReadyAt && this.world.history.length > 1 && save.elapsedMs - this.world.history[0].at >= 1999,
      insightActive: save.elapsedMs < player.insightUntil,
      boss: boss.active && boss.hp > 0 ? { name: `${boss.name} · ${boss.phase}/3`, hp: boss.hp, maxHp: boss.maxHp } : null,
      objective: worldObjective(this.world),
      loom: loomHudSnapshot(this.world),
      omega: omegaHudSnapshot(this.world),
    } });
  }

  private cleanup() {
    if (this.cleaned) return;
    this.cleaned = true;
    this.unsubscribe?.(); this.unsubscribe = undefined;
    this.game.events.off(Phaser.Core.Events.BLUR, this.requestPause);
    this.game.events.off(Phaser.Core.Events.HIDDEN, this.requestPause);
    this.game.renderer.off(Phaser.Renderer.Events.LOSE_WEBGL, this.requestPause);
    this.audio?.destroy();
    this.checkpointMemory.clear();
    this.controls?.destroy(); this.view?.destroy();
  }
}
