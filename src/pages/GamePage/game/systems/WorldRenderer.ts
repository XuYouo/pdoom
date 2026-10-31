import * as Phaser from 'phaser';
import { bossRect, CHINCHILLA_HALF_SIZE, type BulletKind, type WorldState } from '../entities/model';
import { worldPlatforms } from './platforms';
import { FurnaceRenderer } from './FurnaceRenderer';
import { LoomRenderer, loomBranchColor } from './LoomRenderer';
import { OmegaRenderer } from './OmegaRenderer';
import { canReflect } from './rules';
import { decodeCheckpoint } from '../data/checkpoints';
import { contextEffects } from './context';
import { ClawdRenderer } from './ClawdRenderer';
import { EnemySpriteRenderer } from './EnemySpriteRenderer';
import { ChinchillaSpriteRenderer } from './ChinchillaSpriteRenderer';
import { CHINCHILLA_BINDING } from '../data/chinchillaAssets';
import { GatoSpriteRenderer } from './GatoSpriteRenderer';
import { SydneySpriteRenderer } from './SydneySpriteRenderer';
import { SYDNEY_BINDING } from '../data/sydneyAssets';
import { BasiliskSpriteRenderer } from './BasiliskSpriteRenderer';
import { BASILISK_BINDING } from '../data/basiliskAssets';
import { ChapterOneEnvironmentRenderer } from './ChapterOneEnvironmentRenderer';
import { FactoryEnvironmentRenderer } from './FactoryEnvironmentRenderer';
import { FACTORY_ENVIRONMENT_BINDING } from '../data/factoryEnvironmentAssets';
import { FurnaceEnvironmentRenderer } from './FurnaceEnvironmentRenderer';
import { FURNACE_ENVIRONMENT_BINDING } from '../data/furnaceEnvironmentAssets';
import { FactoryRenderer } from './FactoryRenderer';
import { drawChapterDecor } from './ChapterDecor';
import { cameraTarget, stepCamera, worldLabelFits, rasterCameraPoint, type CameraPoint } from './cameraFrame';

const ink = { orange: 0xf3aa78, purple: 0xb197ef };
const bulletColors: Record<BulletKind, number> = { dictionary: 0xeec76d, echo: 0x80d5c8, caption: 0xda91ca, impact: 0xee866a, dialogue: 0x9dcbe4, knife: 0xff9ec3, gpu: 0xf1dc8b, causal: 0xb7ef83, void: 0xb4e2c6, mirror: 0xc7a4f5 };

/** View-only native bodies and environment; Core owns every combat cue and state. */
export class WorldRenderer {
  private clawd: ClawdRenderer;
  private enemies: EnemySpriteRenderer;
  private chinchillas: ChinchillaSpriteRenderer;
  private gato: GatoSpriteRenderer;
  private sydney: SydneySpriteRenderer;
  private basilisk: BasiliskSpriteRenderer;
  private environment: ChapterOneEnvironmentRenderer;
  private nativeEnvironment = false;
  private factoryEnvironment: FactoryEnvironmentRenderer;
  private nativeFactoryEnvironment = false;
  private furnaceEnvironment: FurnaceEnvironmentRenderer;
  private nativeFurnaceEnvironment = false;
  private lastWorld: WorldState | null = null;
  private chapterOneFollow: CameraPoint | null = null;
  private disposed = false;
  private factory: FactoryRenderer;
  private furnace: FurnaceRenderer;
  private loom: LoomRenderer;
  private omega: OmegaRenderer;
  private lastRerollAt: number | null = null;
  private background: Phaser.GameObjects.Graphics;
  private cachedBackdrop: Phaser.GameObjects.RenderTexture | null = null;
  private graphics: Phaser.GameObjects.Graphics;
  private coreGraphics: Phaser.GameObjects.Graphics;
  private factoryForeground: Phaser.GameObjects.Graphics;
  private chapter: WorldState['chapter'] | null = null;
  private labels: Phaser.GameObjects.Text[] = [];
  private stateText: Phaser.GameObjects.Text;
  private bossText: Phaser.GameObjects.Text;

  constructor(private scene: Phaser.Scene) {
    this.background = scene.add.graphics().setDepth(-10);
    this.graphics = scene.add.graphics();
    this.factoryForeground = scene.add.graphics().setDepth(1);
    // Real combat targets and boss danger cues stay above native Images (depth 2), never baked into art.
    this.coreGraphics = scene.add.graphics().setDepth(3);
    this.clawd = new ClawdRenderer(scene);
    this.enemies = new EnemySpriteRenderer(scene);
    this.chinchillas = new ChinchillaSpriteRenderer(scene, CHINCHILLA_BINDING);
    this.gato = new GatoSpriteRenderer(scene);
    this.sydney = new SydneySpriteRenderer(scene, SYDNEY_BINDING);
    this.basilisk = new BasiliskSpriteRenderer(scene, BASILISK_BINDING);
    this.environment = new ChapterOneEnvironmentRenderer(scene, undefined, this.repaintFrozenEnvironment);
    this.factoryEnvironment = new FactoryEnvironmentRenderer<Phaser.Textures.Texture>(scene, FACTORY_ENVIRONMENT_BINDING, this.repaintFrozenEnvironment);
    this.furnaceEnvironment = new FurnaceEnvironmentRenderer(scene, FURNACE_ENVIRONMENT_BINDING, this.repaintFrozenEnvironment);
    this.factory = new FactoryRenderer(scene);
    this.furnace = new FurnaceRenderer(scene);
    this.loom = new LoomRenderer(scene);
    this.omega = new OmegaRenderer(scene);
    this.stateText = scene.add.text(320, 154, '', { fontFamily: 'monospace', fontSize: '15px', color: '#f5dfbd', align: 'center', lineSpacing: 9, backgroundColor: '#101a1be8', padding: { x: 18, y: 14 } }).setOrigin(0.5).setScrollFactor(0).setDepth(8);
    this.bossText = scene.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '9px', color: '#f5dfbd' }).setOrigin(0.5).setDepth(2);
    scene.cameras.main.roundPixels = true;
    scene.game.renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, this.rebuildBackdrop);
  }

  private repaintFrozenEnvironment = () => {
    if (!this.disposed && this.lastWorld) this.draw(this.lastWorld, 0);
  };

  private rebuildBackdrop = () => {
    if (!this.chapter) return;
    this.cachedBackdrop?.destroy(); this.cachedBackdrop = null;
    this.background.setVisible(true);
    if ((this.chapter.stage === 1 && this.nativeEnvironment) || (this.chapter.stage === 2 && this.nativeFactoryEnvironment) || (this.chapter.stage === 3 && this.nativeFurnaceEnvironment)) {
      this.background.clear().fillStyle(0x0f191b).fillRect(0, 0, this.chapter.width, this.chapter.height);
      return;
    }
    drawChapterDecor(this.background, this.chapter);
    const { width, height, stage } = this.chapter;
    const renderer = this.scene.game.renderer;
    const limit = 'getMaxTextureSize' in renderer ? renderer.getMaxTextureSize() : 4096;
    // Preserve the original path on small devices. Only static dressing is baked, never collision or hazards.
    if (stage !== 3 || Math.max(width, height) > limit || width * height > 2_000_000) return;
    this.cachedBackdrop = this.scene.add.renderTexture(0, 0, width, height).setOrigin(0).setDepth(-10).setRenderMode('render');
    // In installed 4.0, setFilter reuploads the texture storage: set it BEFORE baking the framebuffer.
    this.cachedBackdrop.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.cachedBackdrop.draw(this.background).render(); // Phaser 4 buffers commands until render().
    this.background.clear().setVisible(false);
  };

  private checkpointFloor(chapter: WorldState['chapter'], checkpoint: Readonly<{ x: number; y: number }>) {
    return chapter.platforms.find(platform => checkpoint.x >= platform.x && checkpoint.x <= platform.x + platform.w && Math.abs(platform.y - checkpoint.y - 11) < 8)?.y ?? checkpoint.y + 11;
  }

  private configureChapter(world: WorldState) {
    this.chapter = world.chapter; this.nativeEnvironment = false; this.nativeFactoryEnvironment = false; this.nativeFurnaceEnvironment = false; this.chapterOneFollow = null;
    this.rebuildBackdrop();
    this.labels.forEach(label => label.destroy());
    // Chapter3 keeps environmental identifiers here; the React objective owns the one current instruction.
    const furnaceNames = ['GPU CLUSTER', 'NVDA / K-LINE', '安全检查点', 'GPU 热区', 'BASILISK', '因果律核心'];
    this.labels = world.chapter.signs.map((sign, index) => this.scene.add.text(sign.x, sign.y, world.chapter.stage === 3 ? furnaceNames[index] ?? sign.text.split('\n')[0] : sign.text, { fontFamily: 'monospace', fontSize: '10px', color: '#9cb4a9', lineSpacing: 4 }).setDepth(1));
    if (world.chapter.stage <= 2) {
      world.chapter.checkpoints.slice(1).forEach(checkpoint => {
        this.labels.push(this.scene.add.text(checkpoint.x + 22, this.checkpointFloor(world.chapter, checkpoint) - 29, '募捐箱 → 休息室', { fontFamily: 'monospace', fontSize: '8px', color: '#a3b199' }).setDepth(1));
      });
    }
    this.scene.cameras.main.setBounds(0, 0, world.chapter.width, world.chapter.height);
  }

  draw(world: WorldState, deltaMs: number, snapCamera = false) {
    if (this.disposed) return;
    this.lastWorld = world;
    if (this.chapter !== world.chapter) { this.configureChapter(world); snapCamera = true; this.lastRerollAt = null; }
    const rerollAt = world.loom?.lastReroll?.at ?? null;
    if (rerollAt !== null && rerollAt !== this.lastRerollAt) snapCamera = true;
    this.lastRerollAt = rerollAt;
    const { chapter, player } = world;
    const now = world.save.elapsedMs;
    const camera = this.scene.cameras.main;
    const focus = world.mode === 'finished' ? { ...player, x: chapter.arena.x + 320, y: chapter.floor - 11, vy: 0 } : player;
    const frameQuietRoom = !!world.omega && (world.omega.phase === 'chamber' || world.omega.phase === 'reveal') && player.x >= chapter.arena.x + 16;
    const target = cameraTarget(chapter, focus, world.boss.active || world.mode === 'finished' || frameQuietRoom);
    const current = chapter.stage === 1 && this.chapterOneFollow ? this.chapterOneFollow : { x: camera.scrollX, y: camera.scrollY };
    const scroll = stepCamera(current, target, deltaMs, snapCamera);
    if (chapter.stage === 1) {
      // Native4.0 probe found fractional camera drift between Graphics and rounded Image quads.
      this.chapterOneFollow = scroll; const raster = rasterCameraPoint(scroll); camera.setScroll(raster.x, raster.y);
    } else { this.chapterOneFollow = null; camera.setScroll(scroll.x, scroll.y); }
    if (chapter.stage === 1 || chapter.stage === 3) for (const label of this.labels) label.setVisible(worldLabelFits(label.x, label.displayWidth, camera.scrollX));
    const platforms = worldPlatforms(world);
    const nativeEnvironment = this.environment.draw(world, platforms);
    const nativeFactoryEnvironment = this.factoryEnvironment.draw(world, platforms, { x: camera.scrollX, y: camera.scrollY, width: 640, height: 360 });
    const nativeFurnaceEnvironment = this.furnaceEnvironment.draw(world, platforms, { x: camera.scrollX, y: camera.scrollY, width: 640, height: 360 });
    if (nativeEnvironment !== this.nativeEnvironment || nativeFactoryEnvironment !== this.nativeFactoryEnvironment || nativeFurnaceEnvironment !== this.nativeFurnaceEnvironment) {
      this.nativeEnvironment = nativeEnvironment; this.nativeFactoryEnvironment = nativeFactoryEnvironment; this.nativeFurnaceEnvironment = nativeFurnaceEnvironment; this.rebuildBackdrop();
    }
    const nativePlatforms = nativeEnvironment || nativeFactoryEnvironment || nativeFurnaceEnvironment;
    const inView = (x: number, y: number, w = 0, h = 0) => x + w >= camera.scrollX - 50 && x <= camera.scrollX + 690 && y + h >= camera.scrollY - 65 && y <= camera.scrollY + 425;
    const g = this.graphics.clear();
    const core = this.coreGraphics.clear();
    const afterSea = this.factoryForeground.clear();
    const insight = now < player.insightUntil;
    const coreRadius = contextEffects(world.save).coreRadius;
    if (insight) {
      g.fillStyle(0x073a35, 0.27).fillRect(camera.scrollX, camera.scrollY, 640, 360);
      g.lineStyle(1, 0x55c8af, 0.13);
      Array.from({ length: 22 }, (_, n) => g.lineBetween(camera.scrollX + n * 32, camera.scrollY, camera.scrollX + n * 32, camera.scrollY + 360));
    }
    this.furnace.drawEnvironment(g, world, nativeFurnaceEnvironment);
    this.loom.drawEnvironment(g, world);
    this.omega.drawEnvironment(g, world);
    platforms.forEach(platform => {
      if (world.collapsed.includes(platform.id) || !inView(platform.x, platform.y, platform.w, platform.h)) return;
      const node = world.loom?.nodes.find(value => value.id === platform.id);
      const collapsing = !!world.collapseAt[platform.id] || node?.collapseAt != null;
      const fill = node?.branch === 'upper' ? 0x343047 : node?.branch === 'lower' ? 0x243d3f : platform.oneWay ? 0x3a4f44 : 0x293c34;
      const surfaceGraphics = nativeFurnaceEnvironment ? afterSea : g;
      if (!nativePlatforms || collapsing) surfaceGraphics.fillStyle(collapsing ? 0x674336 : fill).fillRect(platform.x, platform.y, platform.w, platform.h);
      // The exact native edge is the ordinary surface; retain only real rule cues over it.
      if (!nativePlatforms || collapsing || node || platform.fragile || platform.protected) {
        surfaceGraphics.fillStyle(collapsing ? 0xed926c : node ? loomBranchColor(node.branch) : platform.fragile ? 0xa98a64 : platform.protected ? 0x90c6b0 : 0x8caa83).fillRect(platform.x, platform.y, platform.w, 3);
      }
      if (!nativePlatforms) g.lineStyle(1, 0x51634d, 0.6).strokeRect(platform.x, platform.y + 3, platform.w, platform.h - 3);
      if (platform.fragile) {
        g.lineStyle(1, collapsing ? 0xfaad6b : 0x121d1b).lineBetween(platform.x + 35, platform.y + 2, platform.x + 42, platform.y + 7);
        g.lineBetween(platform.x + 42, platform.y + 7, platform.x + 37, platform.y + 11);
      }
    });
    this.loom.drawWarnings(g, world);
    chapter.checkpoints.slice(1).forEach(checkpoint => {
      const reached = decodeCheckpoint(world.save.checkpoint).room >= checkpoint.id || world.mode === 'cleared' || world.mode === 'finished';
      const floor = this.checkpointFloor(chapter, checkpoint);
      g.lineStyle(2, reached ? 0x8bca9f : 0x617972).lineBetween(checkpoint.x, floor - 47, checkpoint.x, floor);
      g.fillStyle(reached ? 0x8bca9f : 0x617972).fillTriangle(checkpoint.x, floor - 47, checkpoint.x + 17, floor - 41, checkpoint.x, floor - 35);
      if (chapter.stage <= 2) {
        const x = checkpoint.x + 24;
        g.fillStyle(0x293e34).fillRect(x, floor - 13, 19, 13);
        g.lineStyle(1, 0x82977a).strokeRect(x, floor - 13, 19, 13);
        g.fillStyle(0x121e1b).fillRect(x + 4, floor - 11, 11, 2);
        g.lineStyle(1, world.save.donated ? 0xb0dd93 : 0x708967).lineBetween(x + 5, floor - 7, x + 12, floor - 7).lineBetween(x + 12, floor - 7, x + 12, floor - 4).lineBetween(x + 12, floor - 4, x + 7, floor - 4);
      }
    });
    world.pickups.forEach(pickup => {
      if (!inView(pickup.x, pickup.y)) return;
      if (nativeEnvironment && pickup.kind === 'mushroom') return;
      const y = pickup.y + Math.sin(now / 280 + pickup.x) * 2;
      if (pickup.kind === 'token') {
        g.fillStyle(0xe6c47f).fillCircle(pickup.x, y, 5);
        g.lineStyle(1, 0x806a44).strokeCircle(pickup.x, y, 3);
      } else if (pickup.kind === 'heal') {
        g.fillStyle(0x7dcc9a).fillRect(pickup.x - 3, y - 7, 6, 14).fillRect(pickup.x - 7, y - 3, 14, 6);
      } else if (pickup.kind === 'mushroom') {
        g.fillStyle(0xd3badb).fillRect(pickup.x - 2, y, 4, 9);
        g.fillStyle(0xab72c6).fillEllipse(pickup.x, y - 2, 20, 11);
      } else {
        g.fillStyle(ink.purple).fillTriangle(pickup.x, y - 9, pickup.x + 8, y, pickup.x, y + 9);
        g.fillStyle(0x8063b1).fillTriangle(pickup.x, y - 9, pickup.x - 8, y, pickup.x, y + 9);
      }
    });
    const spriteEnemies = this.enemies.draw(world);
    const nativeChinchillas = this.chinchillas.draw(world);
    world.enemies.filter(enemy => enemy.hp > 0).forEach(enemy => {
      if (!inView(enemy.x, enemy.y)) return;
      if (enemy.kind === 'deceiver' && insight) {
        // Keep the actual combat target at y-19 with the build's 5/8px radius, even with formal actor art.
        core.lineStyle(1, 0x71ddc0).lineBetween(player.x, player.y, enemy.x, enemy.y - 19);
        core.fillStyle(0xfb886f).fillCircle(enemy.x, enemy.y - 19, coreRadius);
        core.lineStyle(1, 0xffd9b7).strokeCircle(enemy.x, enemy.y - 19, coreRadius + 2);
      }
      if (enemy.kind === 'chinchilla' && nativeChinchillas.has(enemy.id)) {
        // Preserve the tiny enemy's real r11 cue, not the generic r17 ring.
        if (enemy.phase === 'tell') core.lineStyle(1, 0xf1dc8b).strokeCircle(enemy.x, enemy.y, CHINCHILLA_HALF_SIZE + 5);
        return;
      }
      if (spriteEnemies.has(enemy.id)) {
        // The sprite replaces only the actor: retain the real attack warning, not a cosmetic timer.
        if (enemy.phase === 'tell') g.lineStyle(2, 0xe6c47f).strokeCircle(enemy.x, enemy.y, 17);
        return;
      }
      if (enemy.kind === 'chinchilla') {
        const r = CHINCHILLA_HALF_SIZE;
        g.fillStyle(0xa7b7b0).fillRect(enemy.x - r, enemy.y - r, r * 2, r * 2).fillRect(enemy.x - 5, enemy.y - r - 3, 3, 3).fillRect(enemy.x + 2, enemy.y - r - 3, 3, 3);
        g.lineStyle(1, 0xe4dec8).strokeRect(enemy.x - r, enemy.y - r, r * 2, r * 2);
        g.fillStyle(0x172b23).fillRect(enemy.x - 3, enemy.y - 3, 1, 2).fillRect(enemy.x + 2, enemy.y - 3, 1, 2);
        if (enemy.phase === 'tell') g.lineStyle(1, 0xf1dc8b).strokeCircle(enemy.x, enemy.y, r + 5);
        return;
      }
      const deceptive = enemy.kind === 'deceiver';
      g.fillStyle(deceptive && !insight ? 0x94b4a3 : enemy.kind === 'repeater' ? 0x6d8fa5 : 0xb47463).fillRect(enemy.x - 10, enemy.y - 11, 20, 22);
      g.lineStyle(1, 0xd5c3a5).strokeRect(enemy.x - 10, enemy.y - 11, 20, 22);
      g.fillStyle(0x162124).fillRect(enemy.x - 5, enemy.y - 4, 3, 4).fillRect(enemy.x + 3, enemy.y - 4, 3, 4);
      if (enemy.kind === 'parrot') g.fillStyle(0xd7af72).fillTriangle(enemy.x - 11, enemy.y - 4, enemy.x - 18, enemy.y, enemy.x - 11, enemy.y + 4);
      if (enemy.phase === 'tell') g.lineStyle(2, 0xe6c47f).strokeCircle(enemy.x, enemy.y, 17);
    });
    this.drawBoss(world);
    world.shocks.forEach(shock => core.fillStyle(0xfb926d, 0.6).fillRect(shock.x - shock.width / 2, chapter.floor - 12, shock.width, 12));
    if (world.rewind) {
      g.lineStyle(2, 0x86d2cc, 0.55);
      world.rewind.path.forEach((sample, index, path) => { if (index > 0) g.lineBetween(path[index - 1].x, path[index - 1].y, sample.x, sample.y); });
    } else if (now >= player.rewindReadyAt && world.history.length > 12) {
      g.fillStyle(0x78bdb4, 0.22);
      world.history.filter((_, index) => index % 12 === 0).forEach(sample => g.fillCircle(sample.x, sample.y, 2));
    }
    // Native boss bodies must not hide real projectiles; the same Core bullets stay above them.
    const shots = (world.boss.kind === 'gato' && world.boss.active) || world.boss.kind === 'sydney' || world.boss.kind === 'basilisk' || (chapter.stage === 3 && !world.boss.active) ? core : g;
    world.bullets.forEach(bullet => {
      if (!inView(bullet.x, bullet.y)) return;
      if (bullet.harmless) {
        const side = bullet.glyph === '(' ? -1 : 1;
        shots.lineStyle(1, 0xbba8d0, 0.8).lineBetween(bullet.x - side, bullet.y - 3, bullet.x + side, bullet.y - 2)
          .lineBetween(bullet.x + side, bullet.y - 2, bullet.x + side, bullet.y + 2).lineBetween(bullet.x + side, bullet.y + 2, bullet.x - side, bullet.y + 3);
        return;
      }
      shots.fillStyle(bullet.faction === 'player' ? bullet.critical ? 0xffffff : ink.orange : bulletColors[bullet.kind]);
      if (bullet.kind === 'dialogue' && bullet.faction === 'enemy') {
        const r = bullet.radius;
        shots.fillRect(bullet.x - r, bullet.y - r, r * 2, r * 2);
        shots.fillStyle(0x214058).fillRect(bullet.x - r + 2, bullet.y - 2, Math.max(3, r), 2);
      } else if (bullet.kind === 'knife' && bullet.faction === 'enemy') {
        const length = Math.hypot(bullet.vx, bullet.vy) || 1, dx = bullet.vx / length, dy = bullet.vy / length;
        shots.fillTriangle(bullet.x + dx * 8, bullet.y + dy * 8, bullet.x - dx * 4 - dy * 3, bullet.y - dy * 4 + dx * 3, bullet.x - dx * 4 + dy * 3, bullet.y - dy * 4 - dx * 3);
      } else if (bullet.kind === 'caption' && bullet.faction === 'enemy') shots.fillRect(bullet.x - 7, bullet.y - 3, 14, 6);
      else shots.fillCircle(bullet.x, bullet.y, bullet.radius);
    });
    this.factory.draw(g, world, core, afterSea, nativeFactoryEnvironment);
    this.furnace.drawCombat(world.boss.kind === 'basilisk' ? core : g, world);
    this.loom.drawCombat(g, world);
    this.omega.drawCombat(g, world);
    this.clawd.draw(world);
    const actorEffects = world.factory ? afterSea : g;
    if (Object.values(player.immunity).some(until => until !== undefined && until > now)) actorEffects.lineStyle(1, 0x87e3cd, 0.8).strokeCircle(player.x, player.y, 17);
    if (now < player.dashUntil) actorEffects.lineStyle(2, 0xffd9ae, 0.6).lineBetween(player.x, player.y, player.x - player.facing * 32, player.y);
    // React owns the single death/chapter transition screen; do not duplicate a text panel behind it.
    this.stateText.setText(world.mode === 'unavailable' ? `第 ${world.save.stage} 章暂不可用\n原进度已保留` : '');
    this.stateText.setVisible(world.mode === 'unavailable');
  }

  private drawBoss(world: WorldState) {
    const spriteBoss = this.gato.draw(world); // Update even on death/other chapters, before the early return.
    const spriteSydney = this.sydney.draw(world);
    const spriteBasilisk = this.basilisk.draw(world);
    const b = world.boss, g = this.graphics, cues = this.coreGraphics, chapter = world.chapter;
    this.bossText.setVisible(b.active && b.hp > 0).setDepth(b.kind === 'gato' || b.kind === 'sydney' || b.kind === 'basilisk' ? 4 : 2);
    if (b.hp <= 0) return;
    this.bossText.setOrigin(0.5);
    if (b.kind === 'mirror') {
      if (b.active) this.bossText.setPosition(b.x, b.y - 42).setText(`AGI / 你的镜像 ${b.phase}/3`);
    } else if (b.kind === 'leviathan') {
      this.loom.drawBoss(g, world);
      const bounds = bossRect(b);
      if (b.active) this.bossText.setOrigin(1, 0.5).setPosition(bounds.x + bounds.w, bounds.y - 20)
        .setText(`LEVIATHAN / ${world.loom && world.loom.turn.weakUntil > world.save.elapsedMs ? '弱点' : '闭壳'} ${b.phase}/3`);
    } else if (b.kind === 'basilisk') {
      if (!spriteBasilisk) {
        const edge = world.furnace?.enraged ? 0xe7a17d : 0xb9df8b;
        g.fillStyle(0x294f3c).fillEllipse(b.x, b.y + 22, 56, 26);
        g.lineStyle(2, edge).strokeEllipse(b.x, b.y + 22, 56, 26);
        g.lineStyle(1, 0x608d5e).strokeEllipse(b.x, b.y + 24, 35, 12);
        g.fillStyle(0x638c5f).fillRect(b.x - 16, b.y - 25, 32, 36);
        g.fillTriangle(b.x + b.facing * 26, b.y - 12, b.x + b.facing * 13, b.y - 25, b.x + b.facing * 13, b.y - 3);
        g.lineStyle(1, edge).strokeRect(b.x - 16, b.y - 25, 32, 36);
        const eyeY = world.furnace?.laser?.y ?? b.y + 15;
        const eyeX = b.x + b.facing * 20;
        g.fillStyle(0x6a9866).fillRect(eyeX - 7, eyeY - 9, 14, 18);
        g.fillStyle(0xedffb8).fillRect(eyeX - 3, eyeY - 3, 6, 6);
        g.fillStyle(0x183321).fillRect(eyeX, eyeY - 3, 1, 6);
        g.lineStyle(1, edge, 0.4).strokeRect(b.x - 26, b.y - 37, 52, 74);
      }
      if (b.active) this.bossText.setPosition(b.x, b.y - 61).setText(`BASILISK / ${world.furnace?.enraged ? '狂暴' : '已受援助'} ${b.phase}/3`);
    } else if (b.kind === 'sydney') {
      if (!spriteSydney) {
        g.fillStyle(0x8aafcb, 0.4).fillTriangle(b.x, b.y - 37, b.x - 26, b.y + 37, b.x + 26, b.y + 37);
        g.fillStyle(0xd8e6ed).fillRect(b.x - 10, b.y - 26, 20, 20).fillTriangle(b.x, b.y - 10, b.x - 19, b.y + 32, b.x + 19, b.y + 32);
        g.lineStyle(1, 0xa6d3e5).strokeRect(b.x - 15, b.y - 31, 30, 28);
        g.fillStyle(0x243a52).fillRect(b.x - 6, b.y - 19, 3, 4).fillRect(b.x + 4, b.y - 19, 3, 4);
      }
      if (b.active && b.action === 'tell') cues.lineStyle(2, 0xf7aacd, 0.75).strokeCircle(b.x, b.y, 42);
      if (b.active) this.bossText.setPosition(b.x, b.y - 61).setText(`SYDNEY / ${b.phase === 1 ? '对话' : b.phase === 2 ? '飞刀' : '控制'} ${b.phase}/3`);
    } else {
      if (!spriteBoss) {
        g.fillStyle(b.active ? 0xb48069 : 0x5b665c).fillRect(b.x - 26, b.y - 37, 52, 74);
        g.lineStyle(2, b.active ? 0xe7b080 : 0x78846c).strokeRect(b.x - 26, b.y - 37, 52, 74);
        g.fillStyle(0x203332).fillRect(b.x - 16, b.y - 23, 32, 23);
        g.fillStyle(0xefa879).fillRect(b.x - 9, b.y - 16, 5, 6).fillRect(b.x + 5, b.y - 16, 5, 6);
      }
      if (canReflect(b)) cues.fillStyle(0xe4cd7e).fillRect(b.x - 34, b.y - 43, 6, 86);
      if (b.phase === 2 && b.action === 'tell') {
        cues.fillStyle(0xea886b, 0.2).fillRect(b.targetX - 56, 52, 112, chapter.floor - 52);
        cues.lineStyle(2, 0xef9e77).strokeRect(b.targetX - 56, chapter.floor - 14, 112, 14);
      }
      if (b.active) {
        this.bossText.setPosition(b.x, b.y - 61).setText(`GATO / ${b.phase === 1 ? '挡板' : b.phase === 2 ? '机械臂' : '字幕'} ${b.phase}/3`);
        cues.fillStyle(0xbb775c, 0.65).fillRect(chapter.arena.x, 65, 4, 255);
      }
    }
    if (b.active) {
      const barY = b.kind === 'leviathan' ? bossRect(b).y - 10 : b.kind === 'mirror' ? b.y - 31 : b.y - 51;
      const bar = b.kind === 'gato' || b.kind === 'sydney' || b.kind === 'basilisk' ? cues : g; // Preserve HP above the tell column, as in the original draw order.
      bar.fillStyle(0x252b28).fillRect(b.x - 32, barY, 64, 4);
      bar.fillStyle(0xebaa7b).fillRect(b.x - 32, barY, 64 * b.hp / b.maxHp, 4);
    }
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true; this.lastWorld = null; this.environment.destroy(); this.factoryEnvironment.destroy(); this.furnaceEnvironment.destroy();
    this.scene.game.renderer.off(Phaser.Renderer.Events.RESTORE_WEBGL, this.rebuildBackdrop);
    this.cachedBackdrop?.destroy(); this.cachedBackdrop = null;
    this.clawd.destroy(); this.enemies.destroy(); this.chinchillas.destroy(); this.gato.destroy(); this.sydney.destroy(); this.basilisk.destroy(); this.factory.destroy(); this.furnace.destroy(); this.loom.destroy(); this.omega.destroy(); this.background.destroy(); this.graphics.destroy(); this.coreGraphics.destroy(); this.factoryForeground.destroy();
    this.labels.forEach(label => label.destroy());
    this.stateText.destroy(); this.bossText.destroy();
  }
}
