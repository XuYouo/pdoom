import { useRef, useState, type FormEvent } from 'react';
import { canStartCoop, coopStartHint, isCoopCode, normalizeCoopCode } from '../functions/coopLobby';
import { useCoopLobby } from '../hooks/useCoopLobby';
import type { CoopClient } from '../network/CoopClient';
import type { CoopRoom } from '../network/protocol';
import './coop-panel.css';

export interface CoopPanelProps { client: CoopClient; onStart: (room: CoopRoom) => void; onClose: () => void; onAccount: () => void }
export function CoopPanel({ client, onStart, onClose, onAccount }: CoopPanelProps) {
  const lobby = useCoopLobby(client, { onStart, onClose });
  return <CoopPanelContent lobby={lobby} onAccount={() => { client.close(); onAccount(); }} />;
}

const connectionNames = { connecting: '正在连接', authenticating: '验证身份', connected: '服务器已连接', reconnecting: '正在重新连接', disconnected: '尚未连接' } as const;
const operationNames = { create: '正在创建房间…', join: '正在加入房间…', ready: '正在确认准备状态…', start: '等待服务器开始对局…', leave: '正在离开房间…' } as const;
export function CoopPanelContent({ lobby, onAccount }: { lobby: ReturnType<typeof useCoopLobby>; onAccount: () => void }) {
  const [code, setCode] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [copyNotice, setCopyNotice] = useState<{ code: string; message: string } | null>(null);
  const invitation = useRef<HTMLInputElement>(null);
  const { auth, room, connection, operation, notice } = lobby;
  const idle = operation.kind === 'idle';
  const connected = connection.status === 'connected';
  const reconnecting = connection.status === 'reconnecting' || room?.phase === 'reconnecting';
  const self = room?.players.find(player => player.slot === room.selfSlot);
  const codeInvalid = submitted && !isCoopCode(normalizeCoopCode(code));
  const exitPending = operation.kind === 'pending' && operation.intent === 'exit';
  const canDisconnect = operation.kind === 'unconfirmed' || connection.status === 'reconnecting' || connection.status === 'disconnected';
  const exitLabel = canDisconnect && (room || operation.kind !== 'idle') ? '断开并返回'
    : exitPending ? '正在确认离开…' : operation.kind === 'pending' ? '取消操作并返回' : room ? '离开房间并返回' : '返回终端';

  function join(event: FormEvent) { event.preventDefault(); setSubmitted(true); lobby.joinRoom(code); }
  async function copyCode() {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopyNotice({ code: room.code, message: '邀请码已复制，可以发送给队友。' });
    } catch {
      invitation.current?.focus(); invitation.current?.select();
      setCopyNotice({ code: room.code, message: '无法访问剪贴板；已选中邀请码，请手动复制。' });
    }
  }
  return <section className="coop-panel" aria-label="在线双人合作大厅">
    <div className="coop-heading"><div><span className="coop-kicker">TWO AGENTS / ONE WORLD</span><h3>{room ? '队伍整备' : '在线双人训练'}</h3></div>
      <span className="coop-connection" data-status={auth ? connection.status : 'disconnected'} role="status"><i aria-hidden="true" />{auth ? connectionNames[connection.status] : '需要登录'}</span>
    </div>
    {!auth ? <div className="coop-signin">
      <img src={`${import.meta.env.BASE_URL}game/clawd-mark.svg`} alt="" aria-hidden="true" />
      <h4>两位玩家，两个已登录账户。</h4><p>先在账户中登录，再创建房间或使用队友的邀请码加入。</p>
      <button type="button" className="coop-primary" autoFocus onClick={onAccount}>前往账户登录</button>
    </div> : room ? <>
      <div className="coop-invitation"><div><label htmlFor="coop-room-code">房间邀请码</label><input ref={invitation} id="coop-room-code" value={room.code} readOnly spellCheck={false} onFocus={event => event.currentTarget.select()} aria-describedby="coop-code-sharing" /></div>
        <button type="button" className="coop-secondary" onClick={() => void copyCode()}>复制邀请码</button>
        <p id="coop-code-sharing">{room.selfSlot === 0 ? '将 8 位邀请码发给队友；另一位玩家登录后即可加入。' : '你已加入房间。双方准备后，由房主开始训练。'}</p>
      </div>
      {copyNotice?.code === room.code && <p className="coop-copy-notice" role="status">{copyNotice.message}</p>}
      <ol className="coop-seats" aria-label="两位玩家席位">{([0, 1] as const).map(slot => {
        const player = room.players.find(candidate => candidate.slot === slot);
        return <li key={slot} className="coop-seat" data-state={!player ? 'empty' : !player.connected ? 'offline' : player.ready ? 'ready' : 'waiting'}>
          <span className="coop-seat-number" aria-hidden="true">0{slot + 1}</span><img src={`${import.meta.env.BASE_URL}game/clawd-mark.svg`} alt="" aria-hidden="true" />
          <div><h4>{slot === 0 ? '房主' : '队友'}{room.selfSlot === slot && <span>你</span>}</h4><p>{!player ? '等待加入' : !player.connected ? '连接中断 · 席位保留中' : player.ready ? '已准备' : '在线 · 尚未准备'}</p></div>
          <span className="coop-seat-mark" aria-hidden="true">{!player ? '＋' : !player.connected ? '…' : player.ready ? '✓' : '●'}</span>
        </li>;
      })}</ol>
      <p className="coop-start-hint" role="status">{coopStartHint(room)}</p>
      {reconnecting && <p className="coop-reconnect-note" role="status">连接暂时中断，服务器为原玩家保留席位最多 30 秒；正在等待恢复。</p>}
      <div className="coop-room-actions"><button type="button" className="coop-secondary" disabled={!idle || !connected || room.phase !== 'lobby' || !self?.connected} onClick={() => lobby.setReady(!self?.ready)}>{self?.ready ? '取消准备' : '准备就绪'}</button>
        {room.selfSlot === 0 ? <button type="button" className="coop-primary" disabled={!idle || !connected || !canStartCoop(room)} onClick={lobby.startMatch}>开始双人训练 <span aria-hidden="true">→</span></button>
          : <span className="coop-host-wait">由房主开始训练</span>}
      </div>
    </> : <div className="coop-entrance">
      <div className="coop-create"><span className="coop-step">01 / HOST</span><h4>创建一个房间</h4><p>生成邀请码，等待另一位已登录玩家加入。</p><button type="button" className="coop-primary" disabled={!idle || !connected} onClick={lobby.createRoom}>创建合作房间 <span aria-hidden="true">＋</span></button></div>
      <form className="coop-join" onSubmit={join}><span className="coop-step">02 / JOIN</span><label htmlFor="coop-join-code">使用邀请码加入</label><p id="coop-join-hint">输入 8 位字母或数字 2–9；大小写均可。</p>
        <input id="coop-join-code" name="inviteCode" value={code} maxLength={16} autoComplete="off" autoCapitalize="characters" spellCheck={false} disabled={!idle || !connected} onChange={event => setCode(normalizeCoopCode(event.target.value))} aria-invalid={codeInvalid} aria-describedby={`coop-join-hint${codeInvalid ? ' coop-join-error' : ''}`} placeholder="如 7GXK4N2P" />
        {codeInvalid && <p id="coop-join-error" className="coop-field-error">请输入完整的 8 位邀请码，不包含 0、1 或符号。</p>}
        <button type="submit" className="coop-secondary" disabled={!idle || !connected}>加入合作房间 <span aria-hidden="true">→</span></button>
      </form>
    </div>}
    {auth && !room && !connected && <div className="coop-connect-message"><p>{connection.message ?? (connection.status === 'authenticating' ? '正在由服务器验证登录状态，请稍候。' : connection.status === 'connecting' ? '正在连接在线合作服务…' : '连接后才能创建或加入房间。')}</p>
      {connection.status === 'disconnected' && <button type="button" className="coop-secondary" onClick={lobby.reconnect}>重试连接</button>}
    </div>}
    {operation.kind !== 'idle' && <p className="coop-operation" role="status" aria-live="polite">{operation.kind === 'unconfirmed' ? '操作结果尚未确认' : exitPending && operation.action !== 'leave' ? '正在等待本次操作完成，随后离开…' : operationNames[operation.action]}</p>}
    {notice && <p className={`coop-notice coop-notice--${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.message}</p>}
    <footer className="coop-footer"><p>{canDisconnect && (room || operation.kind !== 'idle') ? '断开后，可能占用的席位最多保留 30 秒。' : '合作进度独立；不会写入单人检查点或单人排行榜。'}</p><button type="button" className="coop-back" disabled={exitPending && !canDisconnect} onClick={lobby.leaveAndClose}>{exitLabel}</button></footer>
  </section>;
}
