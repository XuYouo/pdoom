import { LOOM_ANCHOR_ID, LOOM_SWALLOW_ORDER } from '../data/loomGraph';
import type { Bullet, WorldEvent, WorldState } from '../entities/model';
import { clamp, normalizedToward } from './geometry';
import { loomNarrowBounds } from './loom';
import { bossPhase } from './rules';

export const LEVIATHAN_RULES = { tellMs: 1200, attackMs: 2800, recoverMs: 1200, weakMs: 3200, turnTravel: 32, turnCross: 14 } as const;

export function advanceLeviathan(world: WorldState, now: number) {
  let boss = { ...world.boss }; let nextId = world.nextBulletId;
  const bullets: Bullet[] = []; const events: WorldEvent[] = [];
  const loom = world.loom;
  if (!loom || !boss.active || boss.hp <= 0) return { boss, bullets, events, nextId };
  const phase = bossPhase(boss.hp, boss.maxHp);
  if (phase !== boss.phase) {
    boss = { ...boss, phase, action: 'recover', actionUntil: now + LEVIATHAN_RULES.recoverMs, enteredAt: now };
    loom.turn.until = 0; loom.turn.weakUntil = 0; loom.turn.startX = null; loom.pullSpeed = 0; loom.swallow = null;
    events.push({ type: 'notice', message: `吞噬者阶段${phase}：下一次将继续吃掉真正的平台。保住中心锚，急左转后才能输出。` });
  }
  if (now < boss.actionUntil) return { boss, bullets, events, nextId };
  switch (boss.action) {
    case 'idle':
    case 'recover': {
      boss.action = 'tell'; boss.actionUntil = now + LEVIATHAN_RULES.tellMs;
      const ids = LOOM_SWALLOW_ORDER.slice(0, boss.phase + 1).filter(id => !loom.eaten.includes(id));
      loom.swallow = { ids, at: boss.actionUntil }; loom.turn.startX = null; loom.turn.until = 0; loom.turn.weakUntil = 0;
      loom.hpUiTaken = loom.eaten.length > 0; loom.stemsLost = Math.min(4, loom.eaten.length) as 0 | 1 | 2 | 3 | 4;
      events.push({ type: 'notice', message: ids.length > 0
        ? '吞噬预警：橙框平台即将消失。到中心锚的标线右侧，吸力开始后A+冲刺急左转！'
        : '吞噬预警：本轮无新增平台消失，已吞地形不会复原。到金线右侧，吸力开始后A+冲刺！' });
      break;
    }
    case 'tell': {
      for (const id of loom.swallow?.ids ?? []) {
        const node = loom.nodes.find(item => item.id === id);
        if (!node || node.protected) continue;
        node.collapsed = true;
        if (!loom.eaten.includes(id)) loom.eaten.push(id);
      }
      loom.swallow = null; loom.narrow = loomNarrowBounds(loom.nodes);
      loom.hpUiTaken = true; loom.stemsLost = Math.min(4, loom.eaten.length) as 0 | 1 | 2 | 3 | 4;
      boss.action = 'attack'; boss.volley += 1; boss.actionUntil = now + LEVIATHAN_RULES.attackMs;
      loom.turn.until = boss.actionUntil; loom.turn.startX = null; loom.pullSpeed = 45 + boss.phase * 35;
      const origin = { x: boss.x - 78, y: boss.y };
      const aim = normalizedToward(origin, world.player, 105 + boss.phase * 15);
      const center = Math.atan2(aim.y, aim.x); const count = 3 + (boss.phase - 1) * 2;
      for (let index = 0; index < count; index += 1) {
        const angle = center + (index - (count - 1) / 2) * 0.13;
        bullets.push({ id: nextId++, ...origin, vx: Math.cos(angle) * (105 + boss.phase * 15), vy: Math.sin(angle) * (105 + boss.phase * 15), radius: 5, damage: 16 + boss.phase * 2, faction: 'enemy', kind: 'void', expiresAt: now + 4500 });
      }
      events.push({ type: 'notice', message: 'SHARP LEFT TURN：在标线右侧向左冲刺，左冲位移至少32px并越过标线！血条隐藏不改变实际HP。' });
      break;
    }
    case 'attack':
      boss.action = 'recover'; boss.actionUntil = now + LEVIATHAN_RULES.recoverMs;
      loom.pullSpeed = 0; loom.turn.until = 0; loom.turn.startX = null;
      break;
  }
  return { boss, bullets, events, nextId };
}

/** Continuous suction and measured dash travel; Q/R relocation cannot impersonate a left turn. */
export function applyLeviathanPressure(world: WorldState, now: number, dt: number): void {
  const loom = world.loom;
  if (!loom || !world.boss.active || world.boss.action !== 'attack' || world.rewind || now >= loom.turn.until) return;
  world.player.x = clamp(world.player.x + loom.pullSpeed * dt, world.chapter.arena.x + 12, world.chapter.arena.x + world.chapter.arena.w - 12);
  const anchor = loom.nodes.find(node => node.id === LOOM_ANCHOR_ID)!;
  const p = world.player;
  const leftDash = now < p.dashUntil && p.vx < -250 && p.facing === -1;
  const onAnchor = p.standingOn === anchor.id && Math.abs(p.y + 11 - anchor.y) < 1;
  if (loom.lastReroll?.at === now || !onAnchor || !leftDash) { loom.turn.startX = null; return; }
  if (loom.turn.startX === null && p.x > loom.turn.lineX + 4 && p.x < loom.turn.lineX + 64) loom.turn.startX = p.x;
  if (loom.turn.startX === null || loom.turn.startX - p.x < LEVIATHAN_RULES.turnTravel || p.x > loom.turn.lineX - LEVIATHAN_RULES.turnCross) return;
  loom.turn.successes += 1; loom.turn.weakUntil = now + LEVIATHAN_RULES.weakMs; loom.turn.until = 0; loom.turn.startX = null; loom.pullSpeed = 0;
  // A real, observable recovery reward during play; swallowed collision surfaces do not return.
  loom.hpUiTaken = false; loom.stemsLost = 0;
  world.boss = { ...world.boss, action: 'recover', actionUntil: loom.turn.weakUntil };
  world.bullets = world.bullets.filter(bullet => bullet.faction === 'player');
  world.events.push({ type: 'notice', message: '急左转成功！弱点打开，血条与音轨暂时吐回；平台不会回来，抓紧J/鼠标输出。' }, { type: 'impact', strength: 0.004 });
}
export function releaseLeviathanPresentation(world: WorldState): void {
  if (!world.loom) return;
  world.loom.hpUiTaken = false; world.loom.stemsLost = 0; world.loom.pullSpeed = 0; world.loom.swallow = null; world.loom.turn.until = 0;
}
