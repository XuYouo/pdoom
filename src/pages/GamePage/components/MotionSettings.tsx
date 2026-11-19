import type { useMotionSettings } from '../hooks/useMotionSettings';

export function MotionSettings({ motion }: { motion: ReturnType<typeof useMotionSettings> }) {
  return <section className="motion-settings settings-motion" aria-label="动态效果设置">
    <div className="settings-section-heading">
      <div><span className="settings-section-index">02 / MOTION</span><h3>动态效果</h3></div>
      <span className="settings-state" data-state="ready">{motion.reducedMotion ? '已减弱' : '标准'}</span>
    </div>
    <fieldset>
      <legend className="settings-visually-hidden">动态效果 / MOTION</legend>
      <div className="settings-motion-options">
        <label data-selected={motion.mode === 'system'}><input type="radio" name="motion-mode" value="system" checked={motion.mode === 'system'} onChange={() => motion.setMode('system')} aria-label="跟随系统" /><span><strong>跟随系统</strong><small>自动响应设备的动态效果偏好</small></span></label>
        <label data-selected={motion.mode === 'reduced'}><input type="radio" name="motion-mode" value="reduced" checked={motion.mode === 'reduced'} onChange={() => motion.setMode('reduced')} aria-label="减少动态效果" /><span><strong>减少动态效果</strong><small>关闭镜头震动，减少界面位移</small></span></label>
      </div>
    </fieldset>
    <p className="settings-motion-status" role="status">当前：{motion.reducedMotion ? '减少动态效果' : '标准动态效果'}。{motion.systemReduced === null ? '系统偏好不可用，采用安全的减少模式。' : motion.systemReduced ? '系统已要求减少动态效果。' : '系统未要求减少动态效果。'}</p>
    <p className="settings-help">角色移动、弹幕和危险预警仍然保留。偏好只存本机，不改变游戏存档。</p>
    {motion.storageWarning && <p role="status" className="settings-warning">{motion.storageWarning}</p>}
  </section>;
}
