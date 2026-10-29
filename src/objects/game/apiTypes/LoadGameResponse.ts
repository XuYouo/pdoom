import type { GameSaveData } from '../GameSaveData';
export interface LoadGameResponse { save: GameSaveData | null; revision: number; updatedAt: string | null }
