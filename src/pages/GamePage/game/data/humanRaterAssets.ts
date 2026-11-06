import type { HumanRaterSnapshot } from './humanRater';
export type HumanRaterPose = HumanRaterSnapshot['pose'];
export const HUMAN_RATER_POSES = Object.freeze(['neutral', 'approved', 'disapproved', 'hacked'] as const);
export interface HumanRaterBinding { readonly key: string; readonly frames: Readonly<Record<HumanRaterPose, string>> }
export const HUMAN_RATER_BINDING: HumanRaterBinding = Object.freeze({
  key: 'human-rater', frames: Object.freeze({ neutral: 'human-rater #neutral.aseprite', approved: 'human-rater #approved.aseprite',
    disapproved: 'human-rater #disapproved.aseprite', hacked: 'human-rater #hacked.aseprite' }),
});
/** Static view roles, never a second animation/gameplay clock. */
export const HUMAN_RATER_ASSET = Object.freeze({ key: HUMAN_RATER_BINDING.key,
  image: 'game/human-rater.png', atlas: 'game/human-rater.json', frameWidth: 64, frameHeight: 64,
  frames: Object.freeze(HUMAN_RATER_POSES.map(pose => HUMAN_RATER_BINDING.frames[pose])),
});
/** Native48-square crop within the existing52x60 station slot; no resampling. */
export function humanRaterPortraitPosition(pose: HumanRaterPose): string {
  const index = HUMAN_RATER_POSES.indexOf(pose);
  if (index < 0) throw Error('Unknown Human Rater pose');
  return `${-(index * 64 + 8)}px -4px`;
}
