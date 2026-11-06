import { CLAWD_FORMS, CLAWD_FRAME_COUNT, clawdFrameName, clawdTexture } from '../data/clawdAssets';
export interface ClawdTextureSource { readonly width: number; readonly height: number; readonly image: unknown; readonly source?: unknown }
export interface ClawdTextureFrame {
  readonly name: string | number; readonly texture: ClawdTexture; readonly source: ClawdTextureSource; readonly sourceIndex: number;
  readonly x: number; readonly y: number; readonly cutX: number; readonly cutY: number;
  readonly width: number; readonly height: number; readonly cutWidth: number; readonly cutHeight: number;
  readonly realWidth: number; readonly realHeight: number; readonly trimmed: boolean; readonly rotated: boolean;
}
export interface ClawdTexture {
  readonly key: string; readonly source: readonly ClawdTextureSource[];
  has(frame: string): boolean; get(frame: string): ClawdTextureFrame | undefined; setFilter(mode: number): unknown;
}
export interface ClawdTextures { exists(key: string): boolean; get(key: string): ClawdTexture }
export interface ClawdResources { readonly textures: readonly ClawdTexture[]; readonly refs: readonly unknown[] }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function nativeImage(value: unknown): boolean {
  if (!object(value)) return false;
  if ('naturalWidth' in value || 'naturalHeight' in value) return value.naturalWidth === 704 && value.naturalHeight === 32;
  return value.width === 704 && value.height === 32;
}
/** Validate all three families and all22 roles, even when the active actor uses none of the appended frames. No writes. */
export function clawdResourceSnapshot(manager: ClawdTextures): ClawdResources | null {
  try {
    const textures: ClawdTexture[] = [], refs: unknown[] = [], images = new Set<unknown>();
    for (const form of CLAWD_FORMS) {
      const key = clawdTexture(form); if (!manager.exists(key)) return null;
      const texture = manager.get(key), sources = texture.source;
      if (texture.key !== key || !Array.isArray(sources) || sources.length !== 1 || typeof texture.setFilter !== 'function') return null;
      const source = sources[0], image = source?.image;
      if (!source || source.width !== 704 || source.height !== 32 || !nativeImage(image) || images.has(image)) return null;
      images.add(image); textures.push(texture); refs.push(texture, sources, source, image, source.source);
      const seen = new Set<ClawdTextureFrame>();
      for (let i = 0; i < CLAWD_FRAME_COUNT; i++) {
        const name = clawdFrameName(i); if (!texture.has(name)) return null;
        const f = texture.get(name);
        if (!f || seen.has(f) || f.name !== name || f.texture !== texture || f.source !== source || f.sourceIndex !== 0
          || f.trimmed !== false || f.rotated !== false || f.x !== 0 || f.y !== 0 || f.cutX !== i * 32 || f.cutY !== 0
          || [f.width, f.height, f.realWidth, f.realHeight, f.cutWidth, f.cutHeight].some(v => v !== 32)) return null;
        seen.add(f); refs.push(f);
      }
    }
    return { textures, refs };
  } catch { return null; }
}
export const clawdResourcesReady = (manager: ClawdTextures): boolean => clawdResourceSnapshot(manager) !== null;
export function sameClawdResources(a: ClawdResources | null, b: ClawdResources | null): boolean {
  return !!a && !!b && a.refs.length === b.refs.length && a.refs.every((v, i) => v === b.refs[i]);
}
