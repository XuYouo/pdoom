import type { AudioStatus } from '../bridge';
import { SynthGraph, scheduleMusicStep, scheduleSfx } from './SynthGraph';
import { STEP_SECONDS, activeStems, isAudioReset, planSfx, planStemLevels } from './score';
import { DEFAULT_AUDIO_PREFERENCES, normalizePreferences, type AudioFrame, type AudioPreferences, type SfxKind, type StemLevels } from './types';
export type { AudioFrame, AudioPreferences } from './types';

const LOOKAHEAD = 0.1;
const MAX_STEPS_PER_TICK = 4;
const SILENCE: StemLevels = { chip: 0, bass: 0, percussion: 0, drive: 0 };
const createNativeContext = (): AudioContext => {
  if (typeof globalThis.AudioContext !== 'function') throw new Error('Web Audio unavailable');
  return new AudioContext({ latencyHint: 'interactive' });
};

/** One owner per Scene. No storage, fetch, shared singleton, Phaser SoundManager, or auto-unlock. */
export class AudioSystem {
  private context: AudioContext | null = null;
  private graph: SynthGraph | null = null;
  private frame: AudioFrame | null = null;
  private preferences: AudioPreferences = { ...DEFAULT_AUDIO_PREFERENCES };
  private levels: StemLevels = { ...SILENCE };
  private status: AudioStatus | null = null;
  private unlocked = false;
  private destroyed = false;
  private failureReported = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private quietTimer: ReturnType<typeof setTimeout> | null = null;
  private unlocking: Promise<void> | null = null;
  private resuming: Promise<void> | null = null;
  private nextTime = 0;
  private step = 0;
  private readonly sfxLastTime = new Map<SfxKind, number>();

  constructor(private readonly onStatus: (status: AudioStatus) => void, private readonly createContext = createNativeContext) {
    this.report('locked'); // Allocates no AudioContext; a real gesture must call unlock().
  }

  private report(status: AudioStatus) {
    if (this.destroyed || status === this.status) return;
    this.status = status;
    try { this.onStatus(status); } catch { /* An optional audio observer must not interrupt simulation. */ }
  }

  private canPlay(): boolean { return !!this.frame?.running && !this.preferences.muted && this.preferences.volume > 0; }

  unlock(): Promise<void> {
    if (this.destroyed || this.status === 'unavailable') return Promise.resolve();
    if (this.unlocking) return this.unlocking;
    // performUnlock creates/resumes synchronously before its first await, preserving user activation.
    const pending = this.performUnlock(); this.unlocking = pending;
    void pending.then(() => { if (this.unlocking === pending) this.unlocking = null; });
    return pending;
  }

  private async performUnlock(): Promise<void> {
    try {
      if (!this.context) {
        const context = this.createContext(); this.context = context;
        this.graph = new SynthGraph(context);
        context.onstatechange = () => {
          if (this.destroyed || this.context !== context) return;
          if (context.state === 'closed') { this.fail(new Error('AudioContext closed outside AudioSystem.destroy'), 'statechange'); return; }
          if (context.state === 'suspended') { this.stopClock(); this.report(this.unlocked ? 'suspended' : 'locked'); }
          else if (this.unlocked && this.canPlay()) this.reconcile();
        };
      }
      const context = this.context;
      await context.resume();
      if (this.destroyed || this.context !== context) return;
      if (context.state !== 'running') { this.report('locked'); return; }
      this.unlocked = true; this.reconcile();
    } catch (error) { this.fail(error, 'unlock'); }
  }

  setPreferences(preferences: AudioPreferences) {
    if (this.destroyed) return;
    this.preferences = normalizePreferences(preferences);
    this.reconcile(); // Does not create a context or request autoplay permission.
  }

  update(frame: AudioFrame) {
    if (this.destroyed) return;
    const reset = isAudioReset(this.frame, frame);
    const cues = planSfx(this.frame, frame);
    this.frame = { ...frame };
    this.levels = planStemLevels(frame);
    if (reset) {
      this.stopClock(); this.graph?.stopAll(); this.sfxLastTime.clear();
      this.step = Number.isFinite(frame.elapsedMs) ? Math.max(0, Math.floor(frame.elapsedMs / (STEP_SECONDS * 1000))) : 0;
      this.nextTime = this.context ? this.context.currentTime + 0.02 : 0;
    }
    this.reconcile();
    const context = this.context, graph = this.graph;
    if (!this.unlocked || !this.canPlay() || !context || !graph || context.state !== 'running') return;
    for (const cue of cues) {
      const previous = this.sfxLastTime.get(cue) ?? -Infinity;
      const interval = cue === 'shot' ? 0.055 : 0.09;
      if (context.currentTime - previous < interval) continue;
      this.sfxLastTime.set(cue, context.currentTime);
      try { scheduleSfx(graph, cue, context.currentTime + 0.002, frame.shots); } catch (error) { this.fail(error, `sfx:${cue}`); return; }
    }
  }

  private reconcile() {
    const context = this.context, graph = this.graph;
    if (this.destroyed || !this.unlocked || !context || !graph) return;
    try {
      graph.setStemLevels(this.levels);
      if (!this.canPlay()) {
        graph.setMaster({ ...this.preferences, muted: true });
        this.stopClock();
        if (context.state === 'suspended') { graph.stopAll(); this.report('suspended'); return; }
        if (this.quietTimer === null) this.quietTimer = setTimeout(() => {
          this.quietTimer = null;
          if (this.destroyed || this.context !== context || this.canPlay()) return;
          graph.stopAll(); this.sfxLastTime.clear();
          void context.suspend().then(() => {
            if (this.destroyed || this.context !== context) return;
            if (this.canPlay()) this.reconcile(); else this.report('suspended');
          }).catch(error => this.fail(error, 'suspend'));
        }, 40); // Fade the bus before stopping voices/suspending; no long-running background audio.
        return;
      }
      if (this.quietTimer !== null) { clearTimeout(this.quietTimer); this.quietTimer = null; }
      graph.setMaster(this.preferences);
      if (context.state !== 'running') { this.resumeKnownContext(context); return; }
      this.report('running');
      if (!activeStems(this.levels).length) { this.stopClock(); return; } // SFX stay on their independent bus.
      if (this.timer === null) {
        this.nextTime = Math.max(this.nextTime, context.currentTime + 0.015);
        this.tick();
        if (!this.destroyed && this.context === context && this.canPlay()) this.timer = setInterval(() => this.tick(), 25);
      }
    } catch (error) { this.fail(error, 'reconcile'); }
  }

  private resumeKnownContext(context: AudioContext) {
    if (this.resuming || this.destroyed || !this.unlocked) return;
    const pending = context.resume().then(() => {
      if (this.destroyed || this.context !== context) return;
      if (context.state === 'running') this.reconcile(); else this.report('suspended');
    }).catch(error => this.fail(error, 'resume'));
    this.resuming = pending;
    void pending.then(() => { if (this.resuming === pending) this.resuming = null; });
  }

  private tick() {
    const context = this.context, graph = this.graph, frame = this.frame;
    if (!context || !graph || !frame || this.destroyed || !this.canPlay() || context.state !== 'running') { this.stopClock(); return; }
    const now = context.currentTime;
    if (this.nextTime < now) {
      // Skip missed audio-clock steps after a stall; never burst a backlog of notes into one frame.
      const skipped = Math.ceil((now - this.nextTime) / STEP_SECONDS);
      this.step += skipped; this.nextTime += skipped * STEP_SECONDS;
    }
    let count = 0;
    try {
      while (this.nextTime < now + LOOKAHEAD && count++ < MAX_STEPS_PER_TICK) {
        scheduleMusicStep(graph, frame.stage, this.step++, this.nextTime, this.levels);
        this.nextTime += STEP_SECONDS;
      }
    } catch (error) { this.fail(error, 'schedule'); }
  }

  private stopClock() { if (this.timer !== null) { clearInterval(this.timer); this.timer = null; } }

  private releaseResources() {
    this.stopClock();
    if (this.quietTimer !== null) { clearTimeout(this.quietTimer); this.quietTimer = null; }
    const context = this.context;
    this.context = null;
    this.graph?.dispose(); this.graph = null;
    this.unlocked = false; this.sfxLastTime.clear();
    if (context) {
      context.onstatechange = null;
      if (context.state !== 'closed') { try { void context.close().catch(() => undefined); } catch { /* Already closed. */ } }
    }
  }

  private fail(error: unknown, operation: string) {
    if (!this.failureReported && !this.destroyed) {
      this.failureReported = true;
      try {
        console.warn('[P(Doom) audio disabled]', {
          operation, contextState: this.context?.state ?? 'absent', audioTime: this.context?.currentTime ?? null,
          stage: this.frame?.stage ?? null, running: this.frame?.running ?? false,
          stemsLost: this.frame?.stemsLost ?? null, levels: { ...this.levels },
          name: error instanceof Error ? error.name : typeof error,
          message: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
        }, error); // Once per instance, local console only; preserve the actual error/stack, not a fabricated cause.
      } catch { /* A diagnostic sink cannot be allowed to break gameplay. */ }
    }
    this.releaseResources();
    this.report('unavailable');
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true; this.releaseResources(); this.frame = null;
  }
}
