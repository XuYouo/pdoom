import { useState, type FormEvent } from 'react';
import type { GameSaveData } from '../../../objects/game/GameSaveData';
import { useCloudAccount } from '../hooks/useCloudAccount';

export function AccountPanel({ save, onRestore }: { save: GameSaveData | null; onRestore: (save: GameSaveData) => void }) {
  const account = useCloudAccount();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const busy = account.status.kind === 'loading';
  function submit(event: FormEvent) {
    event.preventDefault();
    void account.login(mode, username, password).then(() => setPassword(''));
  }
  return <div className="space-y-5">
    <p className="muted-text">本地运行无需账号。登录后可以把安全检查点保存在自己的云存档中；云端不可用时不会伪装成同步成功。</p>
    {account.auth ? <>
      <div className="data-row"><span>已认证智能体</span><strong>{account.auth.user.username}</strong></div>
      <div className="data-row"><span>本地检查点</span><span>{save ? `CH ${save.stage.toString().padStart(2, '0')} · ${save.score} 分` : '无'}</span></div>
      <div className="data-row"><span>云端检查点</span><span>{account.cloud ? account.cloud.save ? `CH ${account.cloud.save.stage} · REV ${account.cloud.revision}` : '空存档' : '尚未读取'}</span></div>
      <div className="flex flex-wrap gap-3">
        <button className="primary-button" disabled={busy} onClick={() => void account.load()}>读取云存档</button>
        <button className="secondary-button" disabled={busy || !save || !account.cloud} onClick={() => save && void account.upload(save)}>本地 → 云端</button>
        <button className="secondary-button" disabled={busy || !account.cloud?.save} onClick={() => { if (account.cloud?.save && window.confirm('用云端检查点替换当前本地检查点？当前战斗不会改变。')) onRestore(account.cloud.save); }}>云端 → 本地</button>
      </div>
      <button className="text-button" disabled={busy} onClick={() => void account.logout()}>撤销会话 / 退出登录 ↗</button>
    </> : <form onSubmit={submit} className="space-y-5">
      <div className="flex gap-2"><button type="button" className={mode === 'login' ? 'tab active' : 'tab'} onClick={() => setMode('login')}>登录</button><button type="button" className={mode === 'register' ? 'tab active' : 'tab'} onClick={() => setMode('register')}>注册智能体</button></div>
      <label className="field-label">玩家名称<span>3–32 位英文字母、数字或下划线</span><input required autoComplete="username" pattern="[A-Za-z0-9_]{3,32}" minLength={3} maxLength={32} value={username} onChange={event => setUsername(event.target.value)} /></label>
      <label className="field-label">密码<span>10–128 位，仅用于本项目账号</span><input required type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={10} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label>
      <button className="primary-button" disabled={busy} type="submit">{busy ? '连接中…' : mode === 'login' ? '建立会话 ↗' : '创建智能体 ↗'}</button>
    </form>}
    {account.status.kind !== 'idle' && <p className={account.status.kind === 'error' ? 'status-message error' : 'status-message'} role="status">{account.status.message}</p>}
  </div>;
}
