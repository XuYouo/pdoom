import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import type { GameBridge, HudSnapshot } from '../game/bridge';
import { TouchContacts, touchPadPosition, type TouchAction, type TouchContact, type TouchControl, type TouchPadBounds } from '../functions/touchControls';
import { insightButtonView, rerollButtonView, rewindButtonView } from '../functions/skillButtons';
import { keepHudControlKeysLocal } from '../functions/hudInput';
import './touch-controls.css';

export interface TouchControlsProps {
  bridge: GameBridge; enabled: boolean; playing: boolean; hud: HudSnapshot; cooperative?: boolean; canAct?: boolean; fullscreenActive?: boolean; onGesture?: () => void;
  onPause: () => void; onContext?: () => void; onFullscreen?: () => void;
}
interface OwnedControl { element: HTMLElement; control: TouchControl; pointerId?: number; bounds?: TouchPadBounds }

export function TouchControls({ bridge, enabled, playing, hud, cooperative = false, canAct = true, fullscreenActive = false, onGesture, onPause, onContext, onFullscreen }: TouchControlsProps) {
  const contacts = useMemo(() => new TouchContacts(input => bridge.send({ type: 'touch-input', input })), [bridge]);
  const owned = useRef(new Map<string, OwnedControl>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const active = enabled && playing && canAct;
  const rewind = rewindButtonView(hud.skills.rewind), insight = insightButtonView(hud.skills.insight);
  const reroll = hud.loom && rerollButtonView(hud.loom);
  const paint = useCallback((entry: OwnedControl) => {
    entry.element.dataset.held = String(contacts.held(entry.control));
    if (!contacts.held(entry.control)) { entry.element.style.setProperty('--touch-x', '0px'); entry.element.style.setProperty('--touch-y', '0px'); }
  }, [contacts]);
  const release = useCallback((owner: string) => {
    const entry = owned.current.get(owner);
    owned.current.delete(owner); contacts.end(owner);
    const timer = timers.current.get(owner); if (timer) clearTimeout(timer); timers.current.delete(owner);
    if (!entry) return;
    paint(entry);
    if (entry.pointerId !== undefined && entry.element.hasPointerCapture?.(entry.pointerId)) {
      try { entry.element.releasePointerCapture(entry.pointerId); } catch { /* The browser may already have cancelled this contact. */ }
    }
  }, [contacts, paint]);
  const clear = useCallback(() => {
    contacts.clear();
    for (const owner of [...owned.current.keys()]) release(owner);
  }, [contacts, release]);

  useLayoutEffect(() => { if (!active) clear(); }, [active, clear]);
  useEffect(() => {
    const orientation = window.matchMedia?.('(orientation: portrait)');
    const hidden = () => { if (document.visibilityState !== 'visible') clear(); };
    window.addEventListener('blur', clear); window.addEventListener('pagehide', clear);
    window.addEventListener('orientationchange', clear); window.addEventListener('resize', clear); document.addEventListener('visibilitychange', hidden);
    orientation?.addEventListener('change', clear);
    return () => {
      window.removeEventListener('blur', clear); window.removeEventListener('pagehide', clear);
      window.removeEventListener('orientationchange', clear); window.removeEventListener('resize', clear); document.removeEventListener('visibilitychange', hidden);
      orientation?.removeEventListener('change', clear); clear();
    };
  }, [clear]);

  function down(event: PointerEvent<HTMLElement>, control: TouchControl, available = true) {
    if (!active || !available || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const element = event.currentTarget, owner = `pointer:${event.pointerId}`;
    const bounds = control === 'move' || control === 'aim' ? element.getBoundingClientRect() : undefined;
    const position = bounds && (control === 'move' || control === 'aim') ? touchPadPosition(control, event.clientX, event.clientY, bounds) : null;
    const contact = position?.contact ?? { kind: control as TouchAction };
    if (!contacts.begin(owner, contact)) return;
    // Touch/pen activation is granted on release, unlike mouse pointerdown.
    if (event.pointerType === 'mouse') onGesture?.();
    const entry = { element, control, pointerId: event.pointerId, bounds };
    owned.current.set(owner, entry); paint(entry);
    if (position) { element.style.setProperty('--touch-x', `${position.offset.x}px`); element.style.setProperty('--touch-y', `${position.offset.y}px`); }
    try { element.setPointerCapture(event.pointerId); } catch { release(owner); }
  }
  function move(event: PointerEvent<HTMLElement>) {
    const owner = `pointer:${event.pointerId}`, entry = owned.current.get(owner);
    if (!active || !entry?.bounds || (entry.control !== 'move' && entry.control !== 'aim')) return;
    event.preventDefault(); event.stopPropagation();
    const position = touchPadPosition(entry.control, event.clientX, event.clientY, entry.bounds);
    contacts.update(owner, position.contact);
    entry.element.style.setProperty('--touch-x', `${position.offset.x}px`); entry.element.style.setProperty('--touch-y', `${position.offset.y}px`);
  }
  function pointerBindings(control: TouchControl, available = true) {
    return { onPointerDown: (event: PointerEvent<HTMLElement>) => down(event, control, available), onPointerMove: move,
      onPointerUp: (event: PointerEvent<HTMLElement>) => {
        const owner = `pointer:${event.pointerId}`, wasOwned = owned.current.has(owner);
        release(owner);
        if (wasOwned && (event.pointerType === 'touch' || event.pointerType === 'pen')) onGesture?.();
      },
      onPointerCancel: (event: PointerEvent<HTMLElement>) => release(`pointer:${event.pointerId}`),
      onLostPointerCapture: (event: PointerEvent<HTMLElement>) => release(`pointer:${event.pointerId}`) };
  }
  function keyboardBindings(control: TouchControl, contact: TouchContact, available = true, suffix: string = control) {
    const owner = `key:${suffix}`;
    return {
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault(); event.stopPropagation();
        if (!active || !available || event.repeat || !contacts.begin(owner, contact)) return;
        onGesture?.();
        const entry = { element: event.currentTarget, control }; owned.current.set(owner, entry); paint(entry);
      },
      onKeyUp: (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); release(owner); }
      },
      onBlur: () => release(owner),
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
        if (event.detail !== 0 || !active || !available || !contacts.begin(owner, contact)) return;
        onGesture?.();
        // Assistive technology may activate a button without a keydown/up pair.
        const entry = { element: event.currentTarget, control }; owned.current.set(owner, entry); paint(entry);
        timers.current.set(owner, setTimeout(() => release(owner), 100));
      },
    };
  }
  function utility(action: () => void) {
    const activate = () => { clear(); action(); };
    return { onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      if (event.pointerType === 'mouse') onGesture?.();
      activate();
    }, onClick: (event: React.MouseEvent<HTMLButtonElement>) => { if (event.detail === 0) { onGesture?.(); activate(); } } };
  }
  const action = (control: TouchAction, label: string, mark: string, available = true, readout?: string | null, title?: string) =>
    <button type="button" className={`touch-button touch-${control}`} data-touch-control={control} disabled={!active} aria-disabled={!active || !available}
      aria-label={label} title={title} {...pointerBindings(control, available)} {...keyboardBindings(control, { kind: control }, available)}>
      <span className="touch-button-mark" aria-hidden="true">{mark}</span><span>{label.replace(/^触屏/, '')}</span>{readout && <small>{readout}</small>}
    </button>;

  if (!enabled) return null;
  return <section className="touch-controls" aria-label="触屏操作" data-playing={playing} onKeyDown={keepHudControlKeysLocal} onContextMenu={event => event.preventDefault()}>
    <nav className="touch-utilities" aria-label="触屏菜单">
      <button type="button" className="touch-utility" aria-label="暂停触屏训练" disabled={!playing} {...utility(onPause)}><span aria-hidden="true">Ⅱ</span><span>暂停</span></button>
      {onContext && <button type="button" className="touch-utility" aria-label="查看触屏构筑" disabled={!playing} {...utility(onContext)}><span aria-hidden="true">▤</span><span>构筑</span></button>}
      {onFullscreen && <button type="button" className="touch-utility touch-fullscreen" aria-label="切换触屏全屏" aria-pressed={fullscreenActive} onPointerDown={event => {
        if (event.button !== 0) return;
        // Keep the native click: touch pointerdown cannot reliably authorize fullscreen.
        event.stopPropagation(); clear();
      }} onClick={() => { onGesture?.(); clear(); onFullscreen(); }}><span aria-hidden="true">⛶</span><span>{fullscreenActive ? '退出' : '全屏'}</span></button>}
    </nav>
    <div className="touch-skill-bank" role="group" aria-label="触屏技能">
      {action('rewind', '触屏回溯', 'Q', hud.rewindReady, rewind.countdown ?? (rewind.state === 'ready' ? null : rewind.label), rewind.hint)}
      {action('insight', '触屏透视', 'E', hud.skills.insight.ready, insight.countdown ?? (insight.state === 'ready' ? null : insight.label), insight.hint)}
      {hud.stage === 4 && hud.loom && reroll && action('reroll', '触屏重掷', 'R', hud.loom.rerollReady, hud.loom.rerollReady ? null : reroll.label, reroll.hint)}
      {cooperative && action('revive', '触屏救援', 'F', true, '按住', '靠近倒地队友并按住救援。')}
    </div>
    <div className="touch-movement touch-pad" data-touch-control="move" role="group" aria-label="左右移动" aria-disabled={!active} {...pointerBindings('move')}>
      <span className="touch-pad-heading" aria-hidden="true">移动</span>
      <button type="button" className="touch-move-key" aria-label="按住向左移动" disabled={!active} {...keyboardBindings('move', { kind: 'move', value: -1 }, true, 'left')}><span aria-hidden="true">◀</span></button>
      <button type="button" className="touch-move-key" aria-label="按住向右移动" disabled={!active} {...keyboardBindings('move', { kind: 'move', value: 1 }, true, 'right')}><span aria-hidden="true">▶</span></button>
      <span className="touch-stick-thumb" aria-hidden="true" />
      <span className="touch-pad-caption" aria-hidden="true">左右滑动</span>
    </div>
    <div className="touch-action-bank" role="group" aria-label="跳跃与冲刺">
      {action('jump', '触屏跳跃', '↑')}{action('dash', '触屏冲刺', '»')}
    </div>
    <button type="button" className="touch-aim touch-pad" data-touch-control="aim" aria-label="按住开火，拖动瞄准" disabled={!active}
      {...pointerBindings('aim')} {...keyboardBindings('aim', { kind: 'aim', direction: null })}>
      <span className="touch-pad-heading">射击</span><span className="touch-aim-ring" aria-hidden="true" /><span className="touch-stick-thumb" aria-hidden="true">＋</span><span className="touch-pad-caption">按住 · 拖动瞄准</span>
    </button>
  </section>;
}
