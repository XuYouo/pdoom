import type { KeyboardEvent } from 'react';
import type { HudSnapshot } from '../game/bridge';
import type { Ending } from '../../../objects/game/GameSaveData';
import { formatTime } from '../functions/saveModel';
import { loomStatus, omegaMemoryNote, omegaStatus } from '../functions/hudPresentation';

const keepDisclosureKeysLocal = (event: KeyboardEvent<HTMLElement>) => {
  if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
};

export function RunHud({ hud, ending }: { hud: HudSnapshot; ending?: Ending }) {
  const ended = ending !== undefined;
  if (ending === 'foom') return <div className="hud-grid foom-hud" aria-label="FOOM 页面内虚拟界面重排">
    <span aria-hidden="true">📎 📎 📎</span><span aria-hidden="true">📎 📎 📎</span><span aria-hidden="true">📎 📎 📎</span><span aria-hidden="true">📎 📎 📎</span>
    <p className="hud-status-line">虚拟重排 · 原数值见结算{hud.omega && ' · 镜像已锁定，不再观察'}</p>
  </div>;
  const taken = hud.loom?.hpUiTaken === true;
  return <div className="hud-grid" aria-label="训练状态">
    <div className={`hud-cell integrity-readout${taken ? ' integrity-readout--taken' : ' integrity-readout--live'}`} key={taken ? 'taken' : 'live'}>
      <span className="micro-label">HP</span>
      {taken ? <p className="integrity-missing" role="status">读数被吞 · HP仍有效</p>
        : <div className="flex items-center gap-3"><div className="integrity-track"><i style={{ width: `${hud.hp}%` }} /></div><strong>{Math.ceil(hud.hp)}<small>/100</small></strong></div>}
    </div>
    <div className="hud-cell"><span className="micro-label">P(DOOM)</span><strong className={hud.doom > 80 ? 'text-red-400' : 'text-[#e8a26b]'}>{hud.doom.toFixed(1)}<small>%</small></strong></div>
    <div className="hud-cell"><span className="micro-label">TOKENS</span><strong className="text-[#acd9bd]">{hud.tokens.toString().padStart(3, '0')}<small> TOK</small></strong></div>
    <div className="hud-cell"><span className="micro-label">TIME</span><strong>{formatTime(hud.elapsedMs)}</strong></div>
    {hud.loom && <details className="hud-details loom-details" aria-label="命运织机详情">
      <summary className="loom-readout hud-status-line" onKeyDown={keepDisclosureKeysLocal}><span>{loomStatus(hud.loom, ending)}</span><span className="hud-detail-toggle">详情</span></summary>
      <div className="hud-detail-body" tabIndex={0} aria-label="展开的状态详情">
        <p>音轨被吞 {hud.loom.stemsLost}/4 · {hud.loom.narrow ? '平台已收窄' : '落脚区仍较宽'}</p>
        <p>{taken ? '读数被吞，实际生命仍正常计算。' : '生命读数可见。'} Q和R都不恢复已消失的平台。</p>
      </div>
    </details>}
    {hud.omega && <details className="hud-details omega-details" aria-label="镜像详情">
      <summary className="omega-readout hud-status-line" onKeyDown={keepDisclosureKeysLocal}><span>{omegaStatus(hud.omega, ending)}</span><span className="hud-detail-toggle">详情</span></summary>
      <div className="hud-detail-body" tabIndex={0} aria-label="展开的状态详情">
        <dl>
          <div><dt>动作偏好</dt><dd>{hud.omega.dominantAction}</dd></div>
          <div><dt>{ended ? '已记录组合' : '当前组合'}</dt><dd>{hud.omega.combo}</dd></div>
          <div><dt>有效构筑</dt><dd>{hud.omega.activeTraits.length ? hud.omega.activeTraits.join('、') : '无激活构筑'}</dd></div>
          <div><dt>已观察组合</dt><dd>{hud.omega.observedCombos}</dd></div>
        </dl>
        <p className="memory-provenance">{omegaMemoryNote(hud.omega, ending)}</p>
      </div>
    </details>}
  </div>;
}
