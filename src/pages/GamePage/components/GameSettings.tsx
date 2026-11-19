import type { CSSProperties } from 'react';
import type { GameSession } from '../hooks/useGameSession';
import { MotionSettings } from './MotionSettings';
import './game-settings.css';

export function GameSettings({ audio, motion }: Pick<GameSession, 'audio' | 'motion'>) {
  const volume = Math.round(audio.preferences.volume * 100);
  const unavailable = audio.status === 'unavailable';
  const locked = audio.status === 'locked';
  const stateLabel = unavailable ? '暂不可用' : locked ? '等待启用' : audio.preferences.muted ? '已静音' : volume === 0 ? '音量为零' : '已就绪';
  const status = unavailable ? '浏览器音频不可用；游戏仍可继续。'
    : locked ? '尚未解锁：点击“启用音频”，或调整下方音量。'
      : audio.preferences.muted ? '已静音。取消静音后，继续训练即可播放。'
        : volume === 0 ? '主音量为零。调高音量后，继续训练即可播放。'
          : audio.status === 'suspended' ? '音频已就绪。继续训练后播放。' : '音频已启用。';

  return <div className="game-settings">
    <p className="settings-intro">按自己的节奏训练。偏好仅保存在本机，关闭设置不会自动恢复战斗。</p>
    <section className="settings-audio" aria-label="原创游戏音频">
      <div className="settings-section-heading">
        <div><span className="settings-section-index">01 / AUDIO</span><h3>声音</h3></div>
        <span className="settings-state" data-state={unavailable ? 'unavailable' : locked ? 'locked' : 'ready'}>{stateLabel}</span>
      </div>
      <div className="settings-audio-status">
        <p role="status" aria-live="polite">{status}</p>
        <button type="button" className={`secondary-button settings-enable-audio${locked ? ' is-available' : ''}`} disabled={unavailable} onClick={audio.unlock}>启用音频</button>
      </div>

      <div className="settings-volume" data-muted={audio.preferences.muted}>
        <div className="settings-volume-heading"><label htmlFor="game-master-volume">主音量</label><output htmlFor="game-master-volume">{volume}<span>%</span></output></div>
        <input id="game-master-volume" type="range" min="0" max="100" step="1" value={volume}
          style={{ '--audio-volume': `${volume}%` } as CSSProperties}
          onChange={event => audio.setVolume(Number(event.target.value) / 100)} aria-label="主音量" aria-describedby="game-volume-hint" />
        <p id="game-volume-hint" className="settings-volume-scale"><span>0</span><span>{audio.preferences.muted ? '静音中 · 调整音量不会取消静音' : '音乐 + 音效'}</span><span>100</span></p>
      </div>

      <label className="settings-mute">
        <span><strong>静音全部音乐与音效</strong><small>保留当前音量，随时恢复声音</small></span>
        <input type="checkbox" checked={audio.preferences.muted} onChange={event => audio.setMuted(event.target.checked)} aria-label="静音全部音乐与音效" />
      </label>
      {audio.storageWarning && <p className="settings-warning" role="status">{audio.storageWarning}</p>}
    </section>

    <MotionSettings motion={motion} />

    <details className="settings-notes">
      <summary>声音与进度说明</summary>
      <div>
        <p>原创四层合成：芯片旋律、低音、打击与失真随 Boss / Doom 叠加。暂停、休息室与失焦时暂停播放；吞音只影响音乐，不吞掉操作音效。</p>
        <p>音量、静音与动态效果偏好不进入游戏存档。休息室须明确选择继续或返回终端；云存档仅通过账户手动读写。</p>
      </div>
    </details>
    <p className="settings-footer"><span>本机偏好 · 即时生效</span><span><kbd>ESC</kbd> 返回</span></p>
  </div>;
}
