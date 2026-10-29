export const RELIC_IDS = ['constitutional', 'recursive', 'interpretability', 'residual', 'lisp', 'context-expansion', 'temperature'] as const;
export type RelicId = typeof RELIC_IDS[number];
export const UPGRADE_IDS = ['reinforced', 'overclocked', 'expanded', 'calibrated'] as const;
export type UpgradeId = typeof UPGRADE_IDS[number];
export type Ending = 'defeat' | 'aligned' | 'warden' | 'foom';

export interface GameSaveData {
  schemaVersion: 1;
  runId: string;
  seed: number;
  stage: number;
  checkpoint: number;
  hp: number;
  doom: number;
  tokens: number;
  score: number;
  elapsedMs: number;
  inventory: RelicId[];
  upgrades: UpgradeId[];
  donated: boolean;
  actionCounts: { shots: number; dashes: number; rewinds: number; insights: number };
}

export interface RunResult {
  save: GameSaveData;
  ending: Ending;
}
