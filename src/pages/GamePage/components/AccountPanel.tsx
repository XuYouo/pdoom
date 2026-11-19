import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Dialog } from '../../../components/ui/Dialog';
import type { GameSaveData } from '../../../objects/game/GameSaveData';
import type { LoadGameResponse } from '../../../objects/game/apiTypes/LoadGameResponse';
import { useCloudAccount } from '../hooks/useCloudAccount';
import { isCompletedSave } from '../game/data/checkpoints';
import { CloudCheckpoint } from './CloudCheckpoint';
import './account-panel.css';

type AccountMode = 'login' | 'register';

export function AccountPanel({ save, onRestore }: { save: GameSaveData | null; onRestore: (save: GameSaveData) => void }) {
  const account = useCloudAccount();
  const [mode, setMode] = useState<AccountMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [restoreCandidate, setRestoreCandidate] = useState<{ cloud: LoadGameResponse; ownerId: string } | null>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const restoreCommitted = useRef(false);
  const busy = account.status.kind === 'loading';
  // A pending confirmation belongs to exactly the loaded snapshot and verified account that opened it.
  const candidate = restoreCandidate?.cloud === account.cloud && restoreCandidate?.ownerId === account.auth?.user.id
    ? restoreCandidate?.cloud.save : null;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!busy) void account.login(mode, username, password).then(() => setPassword(''));
  }
  function navigateTabs(event: KeyboardEvent<HTMLDivElement>) {
    if (busy || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'login' : event.key === 'End' ? 'register' : mode === 'login' ? 'register' : 'login';
    setMode(next);
    tabs.current?.querySelector<HTMLButtonElement>(`[data-mode="${next}"]`)?.focus();
  }
  return <div className="account-panel">
    {account.auth ? <>
      <div className="cloud-account-heading">
        <div><span>已认证智能体</span><strong>{account.auth.user.username}</strong></div>
        <button type="button" className="cloud-signout" disabled={busy} onClick={() => void account.logout()} aria-label="撤销会话 / 退出登录">退出登录</button>
      </div>
      <p className="account-intro">先读取，再选择同步方向。只在你明确操作时传输检查点。</p>
      <div className="cloud-comparison" aria-label="本地与云端进度对照">
        <CloudCheckpoint label="本地检查点" save={save} empty="尚无检查点" />
        <CloudCheckpoint label="云端检查点" save={account.cloud?.save ?? null} empty={account.cloud ? '云端暂无存档' : '尚未读取'} revision={account.cloud?.revision} updatedAt={account.cloud?.updatedAt} />
      </div>
      <div className="cloud-actions">
        <button type="button" className="primary-button" disabled={busy} onClick={() => void account.load()}>读取云存档</button>
        <div className="cloud-transfer-actions">
          <button type="button" className="secondary-button" disabled={busy || !save || !account.cloud} onClick={() => save && void account.upload(save)}>本地 → 云端</button>
          <button type="button" className="secondary-button" disabled={busy || !account.cloud?.save} onClick={() => {
            if (!busy && account.cloud?.save && account.auth) { restoreCommitted.current = false; setRestoreCandidate({ cloud: account.cloud, ownerId: account.auth.user.id }); }
          }}>云端 → 本地</button>
        </div>
      </div>
      <p className="cloud-transfer-hint">{!account.cloud ? '读取云存档后，才能选择上传或载入。' : !save ? '开始训练后会产生本地检查点；已有云端进度可直接载入。' : '上传会更新云端检查点；载入会替换本地检查点，并返回终端。'}</p>
      <p className="account-local-note">退出登录只撤销云端会话，本地游戏进度保留。</p>
    </> : <>
      <p className="account-intro">本地游玩无需账号。登录后，将安全检查点保存到云端，在其他设备继续。</p>
      <div ref={tabs} className="account-tabs" role="tablist" aria-label="账户操作" onKeyDown={navigateTabs}>
        <button id="account-login-tab" type="button" role="tab" aria-selected={mode === 'login'} aria-controls="account-auth-panel" tabIndex={mode === 'login' ? 0 : -1} data-mode="login" disabled={busy} onClick={() => setMode('login')}>登录</button>
        <button id="account-register-tab" type="button" role="tab" aria-selected={mode === 'register'} aria-controls="account-auth-panel" tabIndex={mode === 'register' ? 0 : -1} data-mode="register" disabled={busy} onClick={() => setMode('register')}>注册智能体</button>
      </div>
      <form id="account-auth-panel" role="tabpanel" aria-labelledby={mode === 'login' ? 'account-login-tab' : 'account-register-tab'} onSubmit={submit} aria-busy={busy} className="account-form">
        <label className="account-field" htmlFor="account-username">玩家名称</label>
        <input id="account-username" required disabled={busy} autoComplete="username" autoCapitalize="none" spellCheck={false} pattern="[A-Za-z0-9_]{3,32}" minLength={3} maxLength={32} value={username} onChange={event => setUsername(event.target.value)} aria-describedby="account-username-note" />
        <p id="account-username-note" className="account-field-note">3–32 位英文字母、数字或下划线</p>
        <label className="account-field" htmlFor="account-password">密码</label>
        <input id="account-password" required disabled={busy} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={10} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} aria-describedby="account-password-note" />
        <p id="account-password-note" className="account-field-note">10–128 位，仅用于本项目账号</p>
        <button className="primary-button account-submit" disabled={busy} type="submit">{busy ? '连接中…' : mode === 'login' ? '建立会话 ↗' : '创建智能体 ↗'}</button>
      </form>
      <p className="account-local-note">云端暂不可用时，仍可继续本地训练。</p>
    </>}
    {account.status.kind !== 'idle' && <p className={`account-status account-status--${account.status.kind}`} role={account.status.kind === 'error' ? 'alert' : 'status'}>{account.status.message}</p>}
    {candidate && <>
      <Dialog title="载入云端检查点？" onClose={() => setRestoreCandidate(null)} showCloseButton={false} className="cloud-confirm-dialog">
        <p className="cloud-confirm-warning">用云端检查点替换当前本地检查点？将退出当前战斗并返回终端，当前战斗中尚未保存的进度会放弃。</p>
        <CloudCheckpoint label="即将载入的云端进度" save={candidate} empty="" revision={restoreCandidate?.cloud.revision} />
        <p className="cloud-confirm-next">载入后，选择“{isCompletedSave(candidate) ? '回看结局' : '恢复检查点'}”继续；不会自动进入战斗。</p>
        <div className="cloud-confirm-actions">
          <button type="button" className="secondary-button" autoFocus onClick={() => setRestoreCandidate(null)}>取消，保留本地</button>
          <button type="button" className="primary-button" disabled={busy} onClick={() => { if (!busy && !restoreCommitted.current) { restoreCommitted.current = true; setRestoreCandidate(null); onRestore(candidate); } }}>载入云端并返回终端</button>
        </div>
      </Dialog>
    </>}
  </div>;
}
