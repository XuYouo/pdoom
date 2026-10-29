import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RunHud } from '../../src/pages/GamePage/components/RunHud';
import { MissionConsole } from '../../src/pages/GamePage/components/MissionConsole';
import { GameBridge } from '../../src/pages/GamePage/game/bridge';
import type { GameSession } from '../../src/pages/GamePage/hooks/useGameSession';
import type { HudSnapshot, LoomHudSnapshot, OmegaHudSnapshot } from '../../src/pages/GamePage/game/bridge';
import { compactNotice, compactObjective, loomStatus, missionPresentation, OBJECTIVE_CHARACTER_LIMIT, omegaMemoryNote, omegaStatus } from '../../src/pages/GamePage/functions/hudPresentation';
import { createRun } from '../../src/pages/GamePage/functions/saveModel';
import { createWorld } from '../../src/pages/GamePage/game/systems/simulation';
import { worldObjective } from '../../src/pages/GamePage/game/systems/presentation';

const save = createRun('eee107c5-2789-4560-ad0a-647227630492', 42);
const hud = (patch: Partial<HudSnapshot> = {}): HudSnapshot => ({
  hp: 73, doom: 8, tokens: 123, elapsedMs: 65432, score: 2468, stage: 1,
  rewindReady: false, insightActive: false, boss: null, objective: '跳过断口', ...patch,
});
const loom: LoomHudSnapshot = { timeline: 0, rerollReady: true, hpUiTaken: false, stemsLost: 0, narrow: false, sharpTurnReady: false };
const omega: OmegaHudSnapshot = { phaseLabel: '现场模仿学习', memorySource: 'counts-only', dominantAction: '冲刺', combo: '频次编排：冲刺 → 射击', activeTraits: ['残差连接'], observedCombos: 0, mirrorAction: '预警 / 冲刺' };
const mission = (patch: Partial<Parameters<typeof missionPresentation>[0]> = {}): Parameters<typeof missionPresentation>[0] => ({
  screen: { kind: 'playing' }, hud: hud(), notice: '运行时就绪。你是最后一个仍然对齐的智能体。', saveStatus: '检查点已保存 · 本地', ...patch,
});

const objectiveCases: Array<{ name: string; source: string; cues: string[] }> = [
  { name: 'control bubble', source: '精神控制：仍可 J / 鼠标射击！打碎亮框 PUA 气泡解除定身，Q 不能绕过', cues: ['精神控制：仍可', 'J/鼠标', '打碎PUA气泡', 'Q无效'] },
  { name: 'Sydney dialogue', source: 'Sydney：避开对话框，预警后留意近身控制气泡', cues: ['Sydney', '避开对话框', '近身控制气泡'] },
  { name: 'Sydney knives', source: 'Sydney：颜文字飞刀加速，Q 可取得飞刀类型免疫；控制泡必须击碎', cues: ['Q穿飞刀获同类免疫', '控制泡须射碎'] },
  { name: 'Sydney final phase', source: 'Sydney：对话与飞刀交错，保持射击，先解除精神控制', cues: ['Sydney', '对话与飞刀', '先射碎控制气泡'] },
  { name: 'lethal sea', source: '回形针海已逼近！沿绿色台阶向上跳；海面触及即死，冲刺与Q不提供海水免疫', cues: ['向上跳', '触及即死', '冲刺/Q无效'] },
  { name: 'factory route', source: '沿绿色台阶向上逃生；射击探针阻止复制，侧路算力平台可能被吞噬', cues: ['向上', '射击探针阻止复制', '侧台被吞'] },
  { name: 'petrification', source: '石化：Q就绪后可沿真实两秒轨迹解除；不会自动传送身后，A/D与普通射击暂时受限', cues: ['石化：', 'Q就绪且有两秒历史', '不自动传送'] },
  { name: 'paid left laser', source: 'Basilisk / 已捐款抑制狂暴：已锁向左侧；背向激光，或Q回到之前所在的另一侧', cues: ['已捐款抑制狂暴', '已锁向左侧', '背向激光或Q回旧侧'] },
  { name: 'unpaid right laser', source: 'Basilisk / 未捐款狂暴：已锁向右侧；背向激光，或Q回到之前所在的另一侧', cues: ['未捐款狂暴', '已锁向右侧', '背向激光或Q回旧侧'] },
  { name: 'boss flanking', source: 'Basilisk / 未捐款狂暴：先穿身引它转向，再Q回到旧侧绕后；A/D改变面向，鼠标可背身射击', cues: ['未捐款狂暴', '穿身引转向', 'Q回旧侧绕后'] },
  { name: 'secret room', source: '已抵达K线隐藏房：收集代币与修复，再返回机房主路', cues: ['已抵达K线隐藏房', '代币与修复', '返回主路'] },
  { name: 'rising K-line', source: '正在乘坐K线：上升阶段，靠右站稳后跳向右上隐藏房', cues: ['正在乘坐K线', '上升阶段', '右上隐藏房'] },
  { name: 'falling K-line', source: '正在乘坐K线：回落阶段，保持站稳等待下一轮上升', cues: ['正在乘坐K线', '回落阶段', '站稳等待'] },
  { name: 'optional route', source: '第三章 / 可选K线支路：站上绿色平台随它升降，跃向右上隐藏房', cues: ['可选K线支路', '站上绿台', '右上隐藏房'] },
  { name: 'heat and barrage', source: 'GPU热区按节拍升温；龙猫体小血厚、弹幕密集，Q可穿弹取得同类免疫', cues: ['GPU热区', '等冷却', 'Q穿龙猫弹幕获同类免疫'] },
  { name: 'opened weak point', source: 'SHARP LEFT TURN成功：弱点已开，立即J/鼠标射击；血条和音轨暂时吐回，平台不会复原', cues: ['弱点已开', 'J/鼠标射击', '暂还', '平台不复原'] },
  { name: 'right of turn line', source: '急转弯窗口：现在A + Shift向左冲过金色标线；需要实际跨线位移，闭壳时J无效', cues: ['急转弯窗口', 'A + Shift向左跨金线', '闭壳J无效'] },
  { name: 'left of turn line', source: '吸力窗口：先到金色标线右侧，再A + Shift急转弯；左侧原地按技能不会开弱点', cues: ['吸力窗口', '先到金线右侧', 'A + Shift向左跨线'] },
  { name: 'real swallowed terrain', source: '吞噬预警：橙框平台将真实消失；准备标线右侧起手，R不会还原已经吞掉的平台', cues: ['吞噬预警', '橙框平台将消失', '标线右侧', 'R不还原地形'] },
  { name: 'no new swallow', source: '吞噬预警：本轮无新增平台消失；已吞地形不会复原，准备标线右侧再次急左转', cues: ['无新增平台消失', '标线右侧', '已吞地形不复原'] },
  { name: 'closed shell', source: 'Leviathan闭壳：等待吞噬/吸力预警，以真实向左急转弯打开弱点；留意剩余立足区', cues: ['Leviathan闭壳', 'J无效', '右侧起步急左转'] },
  { name: 'collapsing branch', source: '脚下分支正在坍塌：0.7秒后消失，R切换同段平行落脚点，或立即跳向下一节点', cues: ['0.7秒后消失', '立即跳跃', 'R换同段落脚点'] },
  { name: 'Q in Loom', source: 'Q沿真实轨迹回溯，但不会复原坍塌地形；回溯期间不能R重roll', cues: ['真实轨迹', '不恢复坍塌地形', '期间不能R'] },
  { name: 'real R', source: '已重roll到时间线B：地形已改变，Q重新积累两秒历史；不重发拾取', cues: ['已重roll到时间线B', 'Q重记两秒', '不重发拾取'] },
  { name: 'branch route', source: '时间线A：上/下分支都可前进，靠近才展开；R切换同进度平行地形，不能跳过安全点', cues: ['时间线A', '上下分支均可走', 'R换同段', '不能跳过安全点'] },
  { name: 'final storm', source: '穿过1e30 FLOPs风暴：跳过亮框风暴区与断口，两处安全点可整备；R不会带入最终章', cues: ['1e30 FLOPs风暴', '跳过亮框与断口', '最终章无R'] },
  { name: 'mirror approach', source: '最后的门后只有空椅子与镜子；走近镜面，并在地面站稳，让倒影睁开眼睛', cues: ['空椅子与镜子', '走近镜面', '地面站稳'] },
  { name: 'mirror reveal', source: 'Ilya看到的不是另一个旧神，而是一路升级的你。镜像正读取真实动作频率、有效构筑与观察到的连招', cues: ['Ilya看到的是你', '读取动作与构筑'] },
  { name: 'scan warning', source: '镜像透视预警：离开标出的扫描矩形；只免疫镜像弹不等于免疫扫描和身体接触', cues: ['镜像透视预警', '离开扫描框', '免疫不防扫描/接触'] },
  { name: 'mirror rewind', source: '镜像正在沿自己的真实轨迹回溯；预判它的落点，不要把倒影当作仍站在原地', cues: ['自己的真实轨迹', '预判落点'] },
  { name: 'mirror plan', source: '镜像预告：冲刺 → 射击 → 回溯 → 透视；保持移动，看到实际动作后选择射击、冲刺或Q反击', cues: ['镜像预告', '冲刺→射击→回溯→透视', '保持移动', '执行后反击'] },
  { name: 'mirror opening', source: '镜像恢复空档：趁现在瞄准它射击；你的构筑与新成功连招仍会被观察', cues: ['镜像恢复空档', '瞄准射击', '反击窗口'] },
  { name: 'mirror execution', source: '与你自己对决：偏好冲刺，真实执行冲刺 → 射击 → 回溯 → 透视；弹幕、冲刺与扫描分别躲避', cues: ['镜像执行', '冲刺→射击→回溯→透视', '分别躲避弹幕、冲刺与扫描'] },
];

describe('compact current objectives', () => {
  it.each(objectiveCases)('keeps the actual hazard and response for $name', ({ source, cues }) => {
    const result = compactObjective(source);
    for (const cue of cues) expect(result).toContain(cue);
    expect(Array.from(result).length).toBeLessThanOrEqual(OBJECTIVE_CHARACTER_LIMIT);
    expect(result).not.toMatch(/[\r\n…]/);
  });
  it('does not mechanically truncate or invent advice for an unfamiliar future cue', () => {
    const unknown = `${'新机关状态 '.repeat(10)}必须向右撤离；Q无效`;
    expect(compactObjective(unknown)).toBe(unknown);
    expect(compactObjective('  跳过断口\n 再前进  ')).toBe('跳过断口 再前进');
  });
  it.each([1, 2, 3, 4, 5])('accepts the actual chapter %i producer without changing gameplay state', stage => {
    const world = createWorld({ ...save, stage });
    const before = JSON.stringify(world);
    const result = compactObjective(worldObjective(world));
    expect(result.length).toBeGreaterThan(0);
    expect(Array.from(result).length).toBeLessThanOrEqual(OBJECTIVE_CHARACTER_LIMIT);
    expect(JSON.stringify(world)).toBe(before);
  });
});

describe('one-line chapter status and honest optional details', () => {
  it('keeps real R availability and branch identity without inventing intact terrain', () => {
    expect(loomStatus(loom)).toBe('分支 A · R 就绪 · 音轨被吞 0/4');
    expect(loomStatus({ ...loom, timeline: 1, rerollReady: false, narrow: true })).toBe('分支 B · R 冷却中 · 平台收窄');
    const partial = { ...loom, hpUiTaken: true, stemsLost: 2 };
    expect(loomStatus(partial)).toContain('音轨被吞 2/4');
    expect(loomStatus(partial)).not.toMatch(/完整|等待左转|已恢复/);
    expect(loomStatus({ ...loom, narrow: true, sharpTurnReady: true })).toContain('急左转窗口');
  });
  it('exposes source in visible summary without pretending counted actions are an ordered combo', () => {
    expect(omegaStatus(omega)).toBe('现场模仿学习 · 预警 / 冲刺 · 频次编排');
    const ordered = { ...omega, memorySource: 'ordered' as const, combo: '实际观察：冲刺 → 射击', observedCombos: 3 };
    expect(omegaStatus(ordered)).toContain('实际观察3组');
    expect(omegaMemoryNote(ordered)).toContain('并非整局历史');
    expect(omegaMemoryNote(omega)).toContain('频次编排不代表历史连招');
    expect(omegaStatus({ ...omega, combo: '基础起手：射击' })).toContain('基础起手');
    expect(omegaStatus({ ...omega, combo: '基础起手：射击' })).not.toContain('频次编排');
  });
  it.each(['aligned', 'warden', 'foom', 'defeat'] as const)('locks %s summaries without changing snapshots', ending => {
    const before = JSON.stringify({ loom, omega });
    expect(omegaStatus(omega, ending)).toBe('镜像已锁定 · 不再观察');
    expect(loomStatus(loom, ending)).toBe('分支 A · 本局已结束');
    expect(omegaMemoryNote(omega, ending)).toContain('不能还原历史连招');
    expect(omegaMemoryNote({ ...omega, memorySource: 'ordered' }, ending)).toContain('不再追加');
    expect(JSON.stringify({ loom, omega })).toBe(before);
  });
});

describe('mission visibility and minimal feedback', () => {
  it.each(['playing', 'paused'] as const)('uses only the supplied snapshot while %s', kind => {
    const input = mission({ screen: { kind }, hud: hud({ objective: objectiveCases[0].source }) });
    const before = JSON.stringify(input);
    expect(missionPresentation(input)).toEqual({ objective: compactObjective(input.hud.objective), notice: null });
    expect(JSON.stringify(input)).toBe(before);
  });
  it('leaves menu, ending, rest and chapter-transition copy to their own screens', () => {
    const context = { capacityK: 32 as const, usedK: 0, overloaded: false, hallucinationEvery: null, editable: true, slots: [] };
    const screens: Parameters<typeof missionPresentation>[0]['screen'][] = [
      { kind: 'menu' }, { kind: 'ended', result: { save, ending: 'defeat' } },
      { kind: 'chapter-clear', save: { ...save, stage: 2 }, stage: 1 },
      { kind: 'rest', snapshot: { save, rewardText: '', room: 1, hp: 73, tokens: 123, doom: 8, hackUsed: false, hackEligible: false, hackRequirement: '', message: '', offers: [], context } },
    ];
    for (const screen of screens) expect(missionPresentation(mission({ screen }))).toBeNull();
  });
  it('shows storage failure instead of pretending the removed runtime log saved progress', () => {
    expect(missionPresentation(mission({ saveStatus: '本地保存失败' }))?.notice).toBe('本地保存失败 · 本次进度尚未写入');
  });
  it('keeps real release feedback, but not a stale release during a new control bubble', () => {
    const notice = 'PUA气泡已击碎，控制解除。';
    expect(missionPresentation(mission({ notice }))?.notice).toBe('控制解除');
    expect(missionPresentation(mission({ notice, hud: hud({ objective: objectiveCases[0].source }) }))?.notice).toBeNull();
  });
  it('does not turn persistent narrative or expired threat notices into current objectives', () => {
    for (const notice of ['运行时就绪。', '门后没有怪物。只有一把空椅子和一面落地镜……', '急左转成功！弱点打开，血条与音轨暂时吐回', 'GPU热区即将升温：橙色预警后才造成伤害']) expect(compactNotice(notice)).toBeNull();
    expect(compactNotice('背叛特征节点已击破 · 机械可解释性一击击杀。')).toBe('核心节点已击破');
    expect(compactNotice('注意力发散！本次前向传播变为无伤 Lisp 括号；休息室可调整顺序或扩容。')).toBe('上一发：无伤括号');
    expect(compactNotice('禁忌算力 +9% P(Doom) · 输出提高，弹幕也将加速。')).toBe('禁忌算力 +9% Doom');
  });
});

const fullSession = (input = mission()): GameSession => ({
  ...input, bridge: new GameBridge(), ready: true, loadError: null, panel: null, save,
  audio: { preferences: { muted: false, volume: 0.5 }, status: 'running', storageWarning: null, setMuted: vi.fn(), setVolume: vi.fn(), unlock: vi.fn() },
  context: { capacityK: 32, usedK: 0, overloaded: false, hallucinationEvery: null, editable: false, slots: [] },
  newRun: vi.fn(), start: vi.fn(), resumeCheckpoint: vi.fn(), pause: vi.fn(), resume: vi.fn(), returnToMenu: vi.fn(), openPanel: vi.fn(), setPanel: vi.fn(), persist: vi.fn(() => true), restoreCloud: vi.fn(), setNotice: vi.fn(),
});
const renderHud = (snapshot: HudSnapshot, ending?: Parameters<typeof RunHud>[0]['ending']) => renderToStaticMarkup(createElement(RunHud, { hud: snapshot, ending }));
const summaryHtml = (html: string) => /<summary[^>]*>([\s\S]*?)<\/summary>/.exec(html)?.[1] ?? '';

describe('minimal HUD component structure', () => {
  it('has only HP, Doom, tokens and the last clock cell by default', () => {
    const html = renderHud(hud());
    expect(html.match(/class="hud-cell(?: [^"]*)?"/g)).toHaveLength(4);
    expect(html).toContain('>HP</span>'); expect(html).toContain('>P(DOOM)</span>');
    expect(html).toContain('>TOKENS</span>'); expect(html).toContain('>TIME</span><strong>01:05</strong>');
    expect(html).toContain('123<small> TOK</small>'); expect(html).toContain('8.0<small>%</small>');
    expect(html).not.toMatch(/<details|ALIGNED|MASKED|2468|COMPUTE \/|训练时长/);
  });
  it('actually removes swallowed HP numbers and bar DOM, then restores the unchanged value', () => {
    const snapshot = hud({ loom, hp: 73 });
    const before = JSON.stringify(snapshot);
    const live = renderHud(snapshot);
    expect(live).toContain('integrity-readout--live'); expect(live).toContain('width:73%'); expect(live).toContain('73<small>/100');
    const taken = renderHud({ ...snapshot, loom: { ...loom, hpUiTaken: true, stemsLost: 4 } });
    expect(taken).toContain('integrity-readout--taken'); expect(taken).toContain('读数被吞 · HP仍有效');
    expect(taken).not.toMatch(/integrity-track|width:73%|73<small>\/100/);
    expect(renderHud(snapshot)).toBe(live); expect(JSON.stringify(snapshot)).toBe(before);
  });
  it('puts only a useful one-line Loom summary outside a natively closed disclosure', () => {
    const html = renderHud(hud({ loom: { ...loom, stemsLost: 2, narrow: true } }));
    expect(html).toContain('<details class="hud-details loom-details" aria-label="命运织机详情">');
    const summary = summaryHtml(html);
    expect(summary).toContain('分支 A · R 就绪 · 平台收窄'); expect(summary).toContain('详情');
    expect(summary).not.toContain('实际生命'); expect(summary).not.toContain('恢复已消失');
    expect(html).toContain('音轨被吞 2/4'); expect(html).toContain('Q和R都不恢复已消失的平台');
    expect(html).not.toMatch(/<details[^>]*\bopen|\bhidden=/);
  });
  it('keeps live source feedback visible, but detailed build and provenance explicitly expandable', () => {
    const html = renderHud(hud({ omega }));
    expect(html).toContain('<details class="hud-details omega-details" aria-label="镜像详情">');
    expect(html).toContain('<summary class="omega-readout hud-status-line">');
    const summary = summaryHtml(html);
    expect(summary).toContain('现场模仿学习 · 预警 / 冲刺 · 频次编排');
    expect(summary).not.toMatch(/残差连接|冲刺 → 射击|来源：|历史连招/);
    expect(html).toContain('<dt>有效构筑</dt><dd>残差连接</dd>');
    expect(html).toContain('频次编排不代表历史连招');
    expect(html).not.toMatch(/<details[^>]*\bopen|\bhidden=|本 Scene|不能由计数知道过去连招次序/);
    const observed = summaryHtml(renderHud(hud({ omega: { ...omega, memorySource: 'ordered', observedCombos: 3 } })));
    expect(observed).toContain('实际观察3组');
  });
  it.each(['aligned', 'warden', 'defeat'] as const)('shows %s as locked rather than still learning', ending => {
    const snapshot = hud({ omega }); const before = JSON.stringify(snapshot);
    const html = renderHud(snapshot, ending);
    expect(summaryHtml(html)).toContain('镜像已锁定 · 不再观察');
    expect(html).toContain('已记录组合'); expect(html).not.toContain('现场模仿学习');
    expect(html).not.toContain('预警 / 冲刺'); expect(JSON.stringify(snapshot)).toBe(before);
  });
  it('keeps FOOM local to the virtual HUD, with original values left for the ending summary', () => {
    const snapshot = hud({ omega }); const before = JSON.stringify(snapshot);
    const html = renderHud(snapshot, 'foom');
    expect(html).toContain('FOOM 页面内虚拟界面重排'); expect(html).toContain('原数值见结算');
    expect(html).toContain('镜像已锁定，不再观察'); expect(html).not.toContain('integrity-track');
    expect(html).not.toContain('现场模仿学习'); expect(JSON.stringify(snapshot)).toBe(before);
  });
});

describe('in-world mission component structure', () => {
  it('renders exactly one visible objective without a website sidebar, chapter list or story wall', () => {
    const session = fullSession(mission({ hud: hud({ objective: objectiveCases[17].source }) }));
    const commands: unknown[] = []; session.bridge.onCommand(command => commands.push(command));
    const html = renderToStaticMarkup(createElement(MissionConsole, { session }));
    expect(html).toContain('<section class="mission-console mission-overlay" aria-label="当前目标">');
    expect(html.match(/class="objective"/g)).toHaveLength(1);
    expect(html).toContain('吸力窗口：先到金线右侧，再A + Shift向左跨线');
    expect(html).not.toMatch(/<aside|chapter-list|CONTEXT WINDOW|TRAINING PATH|RUNTIME LOG|安全工程师|hidden=|<button/);
    expect(commands).toEqual([]); expect(session.pause).not.toHaveBeenCalled(); expect(session.persist).not.toHaveBeenCalled();
  });
  it('shows genuine release feedback as a short visible status, not hidden legacy text', () => {
    const session = fullSession(mission({ notice: 'PUA气泡已击碎，控制解除。' }));
    const html = renderToStaticMarkup(createElement(MissionConsole, { session }));
    expect(html).toContain('<p class="runtime-log mission-notice" role="status">控制解除</p>');
    expect(html).not.toContain('PUA气泡已击碎');
  });
  it('does not render a mission alongside the menu or ending narrative', () => {
    for (const screen of [{ kind: 'menu' }, { kind: 'ended', result: { save, ending: 'defeat' } }] satisfies GameSession['screen'][]) {
      const session = fullSession(mission({ screen }));
      expect(renderToStaticMarkup(createElement(MissionConsole, { session }))).toBe('');
    }
  });
});
