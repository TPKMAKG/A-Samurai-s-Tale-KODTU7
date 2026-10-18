import { getAnim, frameIndexAt } from './assets';

export interface DrawOpts {
  /** Animation time in seconds (ignored if `frame` is set). */
  time?: number;
  frame?: number;
  flip?: boolean;
  /** Solid colour silhouette overlay (hit flash). */
  flash?: string | null;
  alpha?: number;
}

let scratch: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;

function getScratch(w: number, h: number): CanvasRenderingContext2D {
  if (!scratch || scratch.width < w || scratch.height < h) {
    scratch = document.createElement('canvas');
    scratch.width = Math.max(w, 64);
    scratch.height = Math.max(h, 64);
    scratchCtx = scratch.getContext('2d')!;
    scratchCtx.imageSmoothingEnabled = false;
  }
  return scratchCtx!;
}

/**
 * Draw an animation frame so that its anchor lands on screen position (x, y).
 * Pass screen coordinates (world minus camera).
 */
export function drawAnim(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, opts: DrawOpts = {}): void {
  const a = getAnim(key);
  const idx = opts.frame !== undefined ? Math.min(opts.frame, a.frames.length - 1) : frameIndexAt(a, opts.time ?? 0);
  let src: CanvasImageSource = a.frames[idx];
  const { w, h } = a;
  const flip = !!opts.flip;
  const dx = Math.round(x - (flip ? w - a.anchorX : a.anchorX));
  const dy = Math.round(y - a.anchorY);

  if (opts.flash) {
    const s = getScratch(w, h);
    s.globalCompositeOperation = 'source-over';
    s.clearRect(0, 0, w, h);
    s.drawImage(src, 0, 0);
    s.globalCompositeOperation = 'source-atop';
    s.fillStyle = opts.flash;
    s.fillRect(0, 0, w, h);
    s.globalCompositeOperation = 'source-over';
    src = scratch!;
  }

  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  if (flip) {
    ctx.translate(dx + w, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(src, 0, 0, w, h, 0, 0, w, h);
  } else {
    ctx.drawImage(src, 0, 0, w, h, dx, dy, w, h);
  }
  ctx.restore();
}

/** 1px outline rectangle, used by debug overlays. */
export function strokeRectPx(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
}
