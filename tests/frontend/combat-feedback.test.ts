import { describe, expect, it } from 'vitest';
import { combatFeedbackMessage, missionEmphasis } from '../../src/pages/GamePage/functions/combatFeedback';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { createWorld, stepWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { worldObjective } from '../../src/pages/GamePage/game/systems/presentation';
import { EMPTY_INPUT } from '../../src/pages/GamePage/game/entities/model';
import { createCoopWorld, stepCoopWorld } from '../../src/pages/GamePage/game/coop';

const save = () => createRun('e097bb99-0a36-4716-82b8-1d31707fdcc2', 42);

describe('feedback from the actual simulation boundary', () => {
  it.each([['rewindPressed', 'recording'], ['insightPressed', 'insight']] as const)('explains a real %s event without mutating the world', (action, kind) => {
    const world = stepWorld(createWorld(save()), { ...EMPTY_INPUT, [action]: true });
    const before = JSON.stringify(world);
    const event = world.events.find(value => value.type === 'notice');
    expect(event?.type).toBe('notice');
    if (event?.type !== 'notice') throw new Error('Expected the real simulation notice');
    expect(combatFeedbackMessage(event.message)?.kind).toBe(kind);
    expect(JSON.stringify(world)).toBe(before);
  });
  it('classifies actual current control and inversion objectives, without assuming ordinary travel is a danger', () => {
    const world = createWorld(save());
    expect(missionEmphasis(worldObjective(world)).tone).toBe('route');
    world.player.invertedUntil = world.save.elapsedMs + 1000;
    expect(missionEmphasis(worldObjective(world)).tone).toBe('danger');
    const factory = createWorld({ ...save(), stage: 2 });
    factory.player.rootedBy = 1;
    expect(missionEmphasis(worldObjective(factory)).tone).toBe('danger');
  });
  it('does not promote unknown prose or historical danger notices to current combat state', () => {
    for (const notice of ['运行时就绪。', 'GPU热区即将升温：橙色预警后才造成伤害', '门后没有怪物。只有一把空椅子', '未知的未来机制']) expect(combatFeedbackMessage(notice)).toBeNull();
    expect(missionEmphasis('未知的未来机制')).toEqual({ tone: 'route', label: '当前目标' });
  });
  it.each([['rewindPressed', 'recording'], ['insightPressed', 'insight']] as const)('maps actual co-op %s receipts only to the player who acted', (action, kind) => {
    const world = stepCoopWorld(createCoopWorld(save()), { p1: EMPTY_INPUT, p2: { ...EMPTY_INPUT, [action]: true } });
    const event = world.events.find(value => value.type === 'notice' && value.playerId === 'p2');
    expect(event?.type).toBe('notice');
    if (event?.type !== 'notice') throw new Error('Expected the actual co-op notice');
    expect(combatFeedbackMessage(event.message)?.kind).toBe(kind);
  });
  it.each([
    ['队伍没有可同时到达的同段安全承载面；本次没有换图，也没有移动任何人。', 'reroll-blocked'],
    ['队伍已原子换到时间线 2；各自Q重新记录，已吞地形与已取奖励不会恢复。', 'reroll'],
    ['队友救援完成：恢复 35 HP。自己的回溯从这里重新记录。', 'rescue'],
    ['队伍禁忌算力 +5% P(Doom)，共享输出与弹幕速度改变。', 'compute'],
  ])('keeps cooperative action feedback visible: %s', (notice, kind) => {
    expect(combatFeedbackMessage(notice)?.kind).toBe(kind);
  });
});
