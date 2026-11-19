import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PlayerGuide } from '../../src/pages/GamePage/components/PlayerGuide';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';

const save = createRun('ddfb05ce-dc0e-4524-b150-85191de69b31', 42);
const guide = (stage: number) => renderToStaticMarkup(createElement(PlayerGuide, { stage, snapshot: { ...save, stage } }));

describe('player field manual', () => {
  it('puts the six actionable controls before chapter tactics and keeps long rules collapsed', () => {
    const html = guide(1);
    for (const key of ['A / D', 'SPACE', 'J', 'SHIFT', 'Q', 'E']) expect(html).toContain(`<kbd>${key}</kbd>`);
    expect(html.indexOf('aria-label="基础操作"')).toBeLessThan(html.indexOf('aria-label="本章战术"'));
    expect(html.indexOf('aria-label="本章战术"')).toBeLessThan(html.indexOf('aria-label="进阶规则"'));
    expect(html.match(/<details>/g)).toHaveLength(4);
    expect(html).not.toMatch(/<details[^>]*open/);
    expect(html).toContain('关闭设置或手册后，训练仍保持暂停');
    expect(html).toContain('按 ESC 不会离开休息室');
  });

  it.each([1, 2, 3, 4, 5])('keeps player rules readable without exposing implementation terms in chapter %i', stage => {
    const html = guide(stage);
    expect(html).not.toMatch(/\b(?:409|Scene|DTO|actionCounts|schema|runId)\b/);
    expect(html).toContain('超过 50% 出现面具');
    expect(html).toContain('超过 80% 进入');
    expect(html).toContain('每室一次，代价 +25% Doom');
    expect(html).toContain('不回血、不重发奖励');
  });

  it('retains chapter selection and saved donation facts without mutating unsupported progress', () => {
    const snapshot = { ...save, stage: 5, checkpoint: 99, donated: true };
    const original = JSON.stringify(snapshot);
    const html = renderToStaticMarkup(createElement(PlayerGuide, { stage: 5, snapshot }));
    expect(html).toContain('安全点编码尚未支持');
    expect(html).toContain('原存档已保留');
    expect(html).toContain('前两章已有捐款记录');
    expect(html).toContain('含结局提示');
    expect(html).not.toContain('右侧的 Gato');
    expect(JSON.stringify(snapshot)).toBe(original);
  });
});
