import { useId } from 'react';
import type { ContextSnapshot, GameBridge } from '../game/bridge';

export interface ContextPanelProps { bridge: GameBridge; snapshot: ContextSnapshot; editable?: boolean }
export function ContextPanel({ bridge, snapshot, editable = true }: ContextPanelProps) {
  const id = useId();
  const canEdit = editable && snapshot.editable;
  return <section className="space-y-4" aria-labelledby={`${id}-title`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 id={`${id}-title`} className="text-base font-semibold">上下文窗口 / CONTEXT</h3>
      <strong className={snapshot.overloaded ? 'text-red-300' : 'text-[#acd9bd]'}>{snapshot.usedK}K / {snapshot.capacityK}K</strong>
    </div>
    <progress className="w-full accent-[#e8a26b]" value={Math.min(snapshot.usedK, snapshot.capacityK)} max={snapshot.capacityK} aria-label={`上下文占用 ${snapshot.usedK}K，容量 ${snapshot.capacityK}K`} />
    <p id={`${id}-capacity`} className="text-sm text-[#b0bfb3]">基础武器和技能预留 8K；遗物按下方顺序占用 Token。扩容可将 32K 提高至 128K，不改变购买货币 TOK。</p>
    {snapshot.overloaded && <div role="status" className="border border-red-400/40 p-3 text-sm text-red-200">
      <strong>Lost in the Middle / 窗口已满或溢出</strong>
      <p className="mt-1">中间词条失活，但仍占容量。每 {snapshot.hallucinationEvery} 发攻击会变成无伤 Lisp 括号；调整顺序只改变失活词条，扩容才能解除过载。</p>
    </div>}
    {!canEdit && <p className="text-sm text-[#b0bfb3]">只能在安全休息室调整顺序，战斗中只读。</p>}
    <ol className="space-y-3" aria-label="已装备词条顺序">
      {snapshot.slots.map((slot, index) => <li key={slot.id} className={`border p-3 ${slot.active ? 'border-[#425347]' : 'border-red-400/50 bg-red-950/20'}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0"><strong>{index + 1}. {slot.name}</strong><span className="ml-2 text-sm text-[#b0bfb3]">{slot.costK}K</span><p className={`mt-1 text-xs ${slot.active ? 'text-[#acd9bd]' : 'text-red-300'}`}>{slot.active ? '已生效' : '中间迷失 · 被动失活'}</p></div>
          <div className="flex gap-2">
            <button type="button" className="secondary-button px-3 py-2" aria-label={`上移 ${slot.name}`} disabled={!canEdit || index === 0} title={!canEdit ? '只可在休息室调整' : index === 0 ? '已经位于首位' : '向前移动一位'} onClick={() => bridge.send({ type: 'context-reorder', from: index, to: index - 1 })}>↑</button>
            <button type="button" className="secondary-button px-3 py-2" aria-label={`下移 ${slot.name}`} disabled={!canEdit || index === snapshot.slots.length - 1} title={!canEdit ? '只可在休息室调整' : index === snapshot.slots.length - 1 ? '已经位于末位' : '向后移动一位'} onClick={() => bridge.send({ type: 'context-reorder', from: index, to: index + 1 })}>↓</button>
          </div>
        </div>
        <p className="mt-2 text-sm text-[#b0bfb3]">{slot.description}</p>
      </li>)}
    </ol>
    {snapshot.slots.length === 0 && <p className="text-sm text-[#b0bfb3]">尚未装备遗物，当前只有基础技能的 8K 占用。</p>}
  </section>;
}
