import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { ContextSnapshot, GameBridge } from '../game/bridge';
import { BASE_CONTEXT_K } from '../game/data/relics';
import { RestOfferIcon } from './RestOfferIcon';
import './context-panel.css';

export interface ContextPanelProps { bridge: GameBridge; snapshot: ContextSnapshot; editable?: boolean; compact?: boolean }
type ReorderRequest = { relicId: string; direction: 'up' | 'down'; expectedOrder: string; control: HTMLButtonElement };

export function ContextPanel({ bridge, snapshot, editable = true, compact = false }: ContextPanelProps) {
  const id = useId();
  const panel = useRef<HTMLElement>(null);
  const pending = useRef<ReorderRequest | null>(null);
  const [feedback, setFeedback] = useState('');
  const canEdit = editable && snapshot.editable;
  const order = snapshot.slots.map(slot => slot.id).join(',');
  const relicK = snapshot.slots.reduce((sum, slot) => sum + slot.costK, 0);
  const inactiveCount = snapshot.slots.filter(slot => !slot.active).length;
  const remainingK = Math.max(0, snapshot.capacityK - snapshot.usedK);
  const overflowK = Math.max(0, snapshot.usedK - snapshot.capacityK);
  const scaleK = Math.max(snapshot.capacityK, snapshot.usedK);

  // Only an engine-confirmed response to this user's command announces or restores focus.
  useLayoutEffect(() => {
    const request = pending.current;
    if (!request) return;
    if (!canEdit) { pending.current = null; return; }
    if (order !== request.expectedOrder) return;
    pending.current = null;
    const index = snapshot.slots.findIndex(slot => slot.id === request.relicId);
    const slot = snapshot.slots[index];
    if (!slot) return;
    setFeedback(`${slot.name}已移至第 ${index + 1} 位，${slot.active ? '已生效' : '中间迷失，仍失活'}。`);
    if (document.activeElement !== request.control && document.activeElement !== document.body) return;
    const row = panel.current?.querySelector(`[data-context-relic="${request.relicId}"]`);
    const sameDirection = row?.querySelector<HTMLButtonElement>(`[data-context-direction="${request.direction}"]:not(:disabled)`);
    const available = sameDirection ?? row?.querySelector<HTMLButtonElement>('button:not(:disabled)');
    available?.focus({ preventScroll: true });
    available?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [canEdit, order, snapshot.slots]);

  function reorder(from: number, to: number, direction: 'up' | 'down', control: HTMLButtonElement) {
    if (!canEdit || to < 0 || to >= snapshot.slots.length) return;
    const expected = snapshot.slots.map(slot => slot.id);
    const [moved] = expected.splice(from, 1);
    expected.splice(to, 0, moved);
    pending.current = { relicId: moved, direction, expectedOrder: expected.join(','), control };
    setFeedback('');
    bridge.send({ type: 'context-reorder', from, to });
  }

  return <section ref={panel} className={`context-panel${compact ? ' context-compact' : ''}`} aria-labelledby={`${id}-title`}>
    <div className="context-heading">
      <div><span className="context-eyebrow" aria-hidden="true">CONTEXT LOADOUT</span><h3 id={`${id}-title`}>{compact ? '当前构筑' : '上下文构筑'}</h3></div>
      <span className="context-edit-state">{canEdit ? '可调整顺序' : '只读'}</span>
    </div>
    <div className="context-capacity">
      <div className="context-capacity-heading"><span>上下文容量</span><strong data-overloaded={snapshot.overloaded}>{snapshot.usedK}K / {snapshot.capacityK}K</strong></div>
      <div className="context-capacity-track" role="meter" aria-label={`上下文占用 ${snapshot.usedK}K，容量 ${snapshot.capacityK}K`} aria-valuemin={0} aria-valuemax={snapshot.capacityK} aria-valuenow={Math.min(snapshot.usedK, snapshot.capacityK)} aria-valuetext={`基础技能 ${BASE_CONTEXT_K}K，遗物 ${relicK}K；${overflowK ? `超出容量 ${overflowK}K` : `剩余 ${remainingK}K`}`}>
        <i className="context-segment context-segment--base" style={{ width: `${BASE_CONTEXT_K / scaleK * 100}%` }} aria-hidden="true" />
        {snapshot.slots.map(slot => <i key={slot.id} className="context-segment context-segment--relic" data-active={slot.active} style={{ width: `${slot.costK / scaleK * 100}%` }} aria-hidden="true" />)}
        {overflowK > 0 && <i className="context-capacity-limit" style={{ left: `${snapshot.capacityK / scaleK * 100}%` }} aria-hidden="true" />}
      </div>
      <dl className="context-capacity-legend"><div><dt><i className="context-legend-base" aria-hidden="true" />基础技能</dt><dd>{BASE_CONTEXT_K}K</dd></div><div><dt><i className="context-legend-relic" aria-hidden="true" />遗物</dt><dd>{relicK}K</dd></div><div data-overloaded={snapshot.overloaded}><dt>{overflowK ? '超出' : '余量'}</dt><dd>{overflowK || remainingK}K</dd></div></dl>
    </div>
    {snapshot.overloaded && <div className="context-overload">
      <strong>{overflowK ? '窗口过载' : '窗口满载'}{inactiveCount > 0 && ` · ${inactiveCount} 个词条失活`}</strong>
      <p>{inactiveCount > 0 ? '中间词条失活，仍占容量。' : '当前词条仍生效，射击已受幻觉干扰。'}{snapshot.hallucinationEvery !== null && `每 ${snapshot.hallucinationEvery} 发攻击，有 1 发变为无伤 Lisp 括号。`}</p>
    </div>}
    <details className="context-capacity-rules">
      <summary>容量与过载规则<span aria-hidden="true">＋</span></summary>
      <p>基础武器和技能预留 {BASE_CONTEXT_K}K；遗物按下方顺序占用上下文，失活后仍占容量。</p>
      <p>占用达到容量时触发 Lost in the Middle（中间迷失）；至少三件遗物时，中间的一件或两件词条失活。排序改变失活位置，不能减少占用。</p>
      <p>扩容可将 32K 提高至 128K，不改变购买货币 TOK。</p>
    </details>
    <div className="context-list-heading"><h4>已装备遗物 <span>{snapshot.slots.length.toString().padStart(2, '0')}</span></h4><span>按当前顺序</span></div>
    <p id={`${id}-reorder-help`} className="context-edit-hint">{canEdit ? '使用上下按钮调整；容量满载时，优先把重要词条移出中间。' : '只能在安全休息室调整顺序，战斗中只读。'}</p>
    <ol className="context-slots" aria-label="已装备词条顺序">
      {snapshot.slots.map((slot, index) => <li key={slot.id} data-context-relic={slot.id} data-active={slot.active} className="context-slot">
        <div className="context-slot-main">
          <span className="context-slot-icon" aria-hidden="true"><RestOfferIcon id={`relic:${slot.id}`} kind="relic" /></span>
          <div className="context-slot-identity"><div className="context-slot-title"><span className="context-slot-number" aria-hidden="true">{(index + 1).toString().padStart(2, '0')}</span><strong>{slot.name}</strong></div><p id={`${id}-${slot.id}-status`} className="context-slot-status">{slot.active ? '已生效' : '中间迷失 · 被动失活'}</p></div>
          <span className="context-slot-cost">{slot.costK}<small>K</small></span>
        </div>
        <div className="context-slot-content">
          {compact ? <details className="context-slot-details"><summary>遗物效果<span aria-hidden="true">＋</span></summary><p>{slot.description}</p></details> : <p className="context-slot-description">{slot.description}</p>}
          <div className="context-slot-order">
            <button type="button" data-context-direction="up" aria-label={`上移 ${slot.name}`} aria-describedby={`${id}-reorder-help ${id}-${slot.id}-status`} disabled={!canEdit || index === 0} title={!canEdit ? '只可在休息室调整' : index === 0 ? '已经位于首位' : '向前移动一位'} onClick={event => reorder(index, index - 1, 'up', event.currentTarget)}>↑</button>
            <button type="button" data-context-direction="down" aria-label={`下移 ${slot.name}`} aria-describedby={`${id}-reorder-help ${id}-${slot.id}-status`} disabled={!canEdit || index === snapshot.slots.length - 1} title={!canEdit ? '只可在休息室调整' : index === snapshot.slots.length - 1 ? '已经位于末位' : '向后移动一位'} onClick={event => reorder(index, index + 1, 'down', event.currentTarget)}>↓</button>
          </div>
        </div>
      </li>)}
    </ol>
    {snapshot.slots.length === 0 && <div className="context-empty"><span aria-hidden="true">[  ]</span><strong>尚未装备遗物</strong><p>当前只有基础技能的 {BASE_CONTEXT_K}K 占用。探索关卡或到休息室获得遗物，构筑会显示在这里。</p></div>}
    <p className="context-reorder-feedback" role="status" aria-live="polite" aria-atomic="true">{feedback}</p>
  </section>;
}
