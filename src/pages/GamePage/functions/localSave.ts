import type { GameSaveData } from '../../../objects/game/GameSaveData';
import { isGameSave, parseSave } from './saveModel';

const KEY = 'pdoom.save.v1';
const BACKUP = 'pdoom.save.v1.backup';
export type SaveLoad = { status: 'empty' } | { status: 'ready'; save: GameSaveData; recovered: boolean } | { status: 'error'; message: string };

/** localStorage setItem is atomic; preserve the previous validated value as backup. */
export function writeLocalSave(storage: Pick<Storage, 'getItem' | 'setItem'>, save: GameSaveData): void {
  if (!isGameSave(save)) throw new Error('检查点数据无效，未覆盖已有存档。');
  const previous = storage.getItem(KEY);
  if (previous && parseSave(previous)) storage.setItem(BACKUP, previous);
  storage.setItem(KEY, JSON.stringify(save));
}

export function readLocalSave(storage: Pick<Storage, 'getItem'>): SaveLoad {
  try {
    const raw = storage.getItem(KEY);
    const save = raw ? parseSave(raw) : null;
    if (save) return { status: 'ready', save, recovered: false };
    const backup = storage.getItem(BACKUP);
    const recovered = backup ? parseSave(backup) : null;
    if (recovered) return { status: 'ready', save: recovered, recovered: true };
    return raw || backup ? { status: 'error', message: '本地存档损坏或版本不兼容，已保留原数据。可开始新训练。' } : { status: 'empty' };
  } catch {
    return { status: 'error', message: '浏览器阻止了本地存储；本次仍可游玩，但无法自动保存。' };
  }
}
