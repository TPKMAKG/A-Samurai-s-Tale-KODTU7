/**
 * Sprite / animation registry.
 *
 * Every visual is looked up by a string key (e.g. "player_run"). At boot the
 * placeholder generator registers code-drawn art for every key. Afterwards,
 * any PNG sprite sheets listed in `src/assets/manifest.ts` override those keys.
 * Game code never knows (or cares) whether it is drawing placeholder or final art.
 */

export interface Anim {
  frames: CanvasImageSource[];
  fps: number;
  loop: boolean;
  w: number;
  h: number;
  /** Pixel in the frame that sits on the entity's bottom-center (feet). */
  anchorX: number;
  anchorY: number;
}

export interface SheetSpec {
  key: string;
  /** Path relative to /public, e.g. "assets/player_run.png". */
  url: string;
  frameW: number;
  frameH: number;
  frames: number;
  /** Which row of the sheet to read (default 0). */
  row?: number;
  fps?: number;
  loop?: boolean;
  anchorX?: number;
  anchorY?: number;
}

const anims = new Map<string, Anim>();
const warned = new Set<string>();
let missingAnim: Anim | null = null;

export function registerAnim(key: string, anim: Anim): void {
  anims.set(key, anim);
}

export function getAnim(key: string): Anim {
  const a = anims.get(key);
  if (a) return a;
  if (!warned.has(key)) {
    warned.add(key);
    console.warn(`[assets] Missing sprite "${key}" — drawing magenta placeholder.`);
  }
  if (!missingAnim) {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ff00ff';
    g.fillRect(0, 0, 16, 16);
    missingAnim = { frames: [c], fps: 1, loop: true, w: 16, h: 16, anchorX: 8, anchorY: 16 };
  }
  return missingAnim;
}

/** First frame of a key — handy for static sprites like tiles. */
export function getSprite(key: string): CanvasImageSource {
  return getAnim(key).frames[0];
}

export function frameIndexAt(a: Anim, time: number): number {
  const i = Math.floor(time * a.fps);
  return a.loop ? i % a.frames.length : Math.min(i, a.frames.length - 1);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

/** Load PNG sprite sheets and override placeholder keys. Failures keep the placeholder. */
export async function loadSheetOverrides(specs: SheetSpec[]): Promise<void> {
  await Promise.all(
    specs.map(async (s) => {
      try {
        const img = await loadImage(s.url);
        const frames: HTMLCanvasElement[] = [];
        for (let i = 0; i < s.frames; i++) {
          const c = document.createElement('canvas');
          c.width = s.frameW;
          c.height = s.frameH;
          const g = c.getContext('2d')!;
          g.imageSmoothingEnabled = false;
          g.drawImage(img, i * s.frameW, (s.row ?? 0) * s.frameH, s.frameW, s.frameH, 0, 0, s.frameW, s.frameH);
          frames.push(c);
        }
        const prev = anims.get(s.key);
        registerAnim(s.key, {
          frames,
          fps: s.fps ?? prev?.fps ?? 8,
          loop: s.loop ?? prev?.loop ?? true,
          w: s.frameW,
          h: s.frameH,
          anchorX: s.anchorX ?? Math.floor(s.frameW / 2),
          anchorY: s.anchorY ?? s.frameH,
        });
      } catch (err) {
        console.warn(`[assets] Could not load sheet for "${s.key}", keeping placeholder.`, err);
      }
    }),
  );
}
