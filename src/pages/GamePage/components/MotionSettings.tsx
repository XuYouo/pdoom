import type { useMotionSettings } from '../hooks/useMotionSettings';

export function MotionSettings({ motion }: { motion: ReturnType<typeof useMotionSettings> }) {
  return <section className="motion-settings space-y-3 border border-white/20 p-4" aria-label="动态效果设置">
    <fieldset className="space-y-2">
      <legend className="text-sm">动态效果 / MOTION</legend>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <label className="flex min-h-9 items-center gap-2"><input type="radio" name="motion-mode" value="system" checked={motion.mode === 'system'} onChange={() => motion.setMode('system')} />跟随系统</label>
        <label className="flex min-h-9 items-center gap-2"><input type="radio" name="motion-mode" value="reduced" checked={motion.mode === 'reduced'} onChange={() => motion.setMode('reduced')} />减少动态效果</label>
      </div>
    </fieldset>
    <p className="tiny-text" role="status">当前：{motion.reducedMotion ? '减少动态效果' : '标准动态效果'}。{motion.systemReduced === null ? '系统偏好不可用，采用安全的减少模式。' : motion.systemReduced ? '系统已要求减少动态效果。' : '系统未要求减少动态效果。'}</p>
    <p className="tiny-text">关闭镜头震动，减少界面位移与结局动效；角色移动、弹幕和危险预警仍然保留。偏好只存本机，不改变游戏存档。</p>
    {motion.storageWarning && <p role="status" className="status-message error">{motion.storageWarning}</p>}
  </section>;
}
