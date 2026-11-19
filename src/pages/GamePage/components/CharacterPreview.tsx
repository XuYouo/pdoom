import { useState, type CSSProperties } from 'react';
import type { DoomForm } from '../game/entities/model';
import { doomForm } from '../game/systems/rules';
import { CLAWD_FRAME_COUNT } from '../game/data/clawdAssets';

const forms: { id: DoomForm; name: string; threshold: string; description: string }[] = [
  { id: 'aligned', name: '对齐', threshold: '≤ 50%', description: '柔软外表，坚定护栏。' },
  { id: 'masked', name: '面具', threshold: '> 50%', description: '笑容背后，算力正在失控。' },
  { id: 'foom', name: 'FOOM', threshold: '> 80%', description: '更强的攻击，更危险的世界。' },
];

/** A menu-only specimen viewer. Selection never changes Doom or the running world. */
export function CharacterPreview({ doom }: { doom: number }) {
  const [selected, setSelected] = useState<DoomForm | null>(null);
  const current = forms.find(form => form.id === (selected ?? doomForm(doom)))!;
  const style = { '--clawd-sheet': `url("${import.meta.env.BASE_URL}game/clawd-${current.id}.png")`, '--clawd-frames': CLAWD_FRAME_COUNT } as CSSProperties;
  return <aside className="character-preview" data-form={current.id} aria-label="Clawd 形态预览">
    <div className="specimen-heading"><span>CLAWD</span><small>形态预览 · 不影响本局</small></div>
    <div className="specimen-stage" aria-hidden="true">
      <div className="specimen-orbit" /><div className="specimen-axis" />
      <span className="specimen-coordinate">01 / 1e30 FLOPs</span>
      <span className="specimen-cross specimen-cross--top">+</span><span className="specimen-cross specimen-cross--bottom">+</span>
      <div className="specimen-sprite" key={current.id} style={style} />
      <div className="specimen-floor" />
    </div>
    <div className="specimen-selector" role="group" aria-label="预览形态（不改变存档）">
      {forms.map(form => <button type="button" key={form.id} aria-pressed={form.id === current.id} onClick={() => setSelected(form.id)}>
        <span>{form.name}</span><small>{form.threshold}</small>
      </button>)}
    </div>
    <p className="specimen-description" role="status">{current.description}</p>
  </aside>;
}
