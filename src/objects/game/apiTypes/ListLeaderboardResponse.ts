import type { Ending } from '../GameSaveData';
export interface LeaderboardEntry { rank: number; username: string; score: number; stage: number; doom: number; ending: Ending; createdAt: string }
export interface ListLeaderboardResponse { entries: LeaderboardEntry[]; nextOffset: number | null }
