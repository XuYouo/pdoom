import type { ChapterDefinition } from '../entities/model';
import { CHAPTER_ONE } from './chapterOne';
import { CHAPTER_TWO } from './chapterTwo';
import { CHAPTER_THREE } from './chapterThree';
import { CHAPTER_FOUR } from './chapterFour';
import { CHAPTER_FIVE } from './chapterFive';

export type { ChapterDefinition } from '../entities/model';
export const PLAYABLE_CHAPTERS: readonly ChapterDefinition[] = [CHAPTER_ONE, CHAPTER_TWO, CHAPTER_THREE, CHAPTER_FOUR, CHAPTER_FIVE];
export const getChapter = (stage: number): ChapterDefinition | undefined => PLAYABLE_CHAPTERS.find(chapter => chapter.stage === stage);
export const isChapterPlayable = (stage: number): boolean => getChapter(stage) !== undefined;
