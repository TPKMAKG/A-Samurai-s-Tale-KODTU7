import { VIEW_W, VIEW_H } from '../config';
import { PAL } from '../art/palette';

// ─── Intro Cutscene: Old Japanese Cinema Style (monochrome, 24fps, film grain) ─

export const INTRO_SCENES = [
  { dur: 7.5, text: 'They came in the night, and left no one alive.' },
  { dur: 5.5, text: 'They will pay for this.' },
];

const FILM_FPS = 24;
const BAR_TOP = 18;
const BAR_BOTTOM = 22;

/** Warm silver-sepia monochrome tone ramp (0 = ink black, 1 = paper white). */
function tone(v: number, a = 1): string {
  const c = Math.max(0, Math.min(1, v));
  const r = Math.round(12 + c * 238);
  const g = Math.round(9 + c * 220);
  const b = Math.round(7 + c * 184);
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

const hash = (x: number): number => {
  const s = Math.sin(x * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string): void {
  ctx.fillStyle = col;
  const rr = Math.max(1, Math.round(r));
  for (let dy = -rr; dy <= rr; dy++) {
    const span = Math.floor(Math.sqrt(rr * rr - dy * dy));
    ctx.fillRect(Math.round(cx - span), Math.round(cy + dy), span * 2 + 1, 1);
  }
}

// ─── Scene 1: The Burning Estate ─────────────────────────────────────────────

function flames(ctx: CanvasRenderingContext2D, x0: number, x1: number, baseY: number, maxH: number, t: number, seed: number): void {
  for (let x = x0; x <= x1; x += 2) {
    const k = x * 0.37 + seed;
    const h = maxH * (0.5 + 0.28 * Math.sin(t * 11 + k * 2.1) + 0.22 * Math.sin(t * 6.3 + k * 4.7));
    const hh = Math.max(2, Math.round(h));
    for (let y = 0; y < hh; y++) {
      const f = y / hh;
      const sway = Math.round(Math.sin(t * 8 + k + f * 3) * f * 2.5);
      const w = f < 0.45 ? 3 : f < 0.8 ? 2 : 1;
      ctx.fillStyle = tone(f < 0.3 ? 1 : f < 0.6 ? 0.86 : 0.62);
      ctx.fillRect(x + sway - (w >> 1), baseY - y, w, 1);
    }
  }
}

function japaneseRoof(ctx: CanvasRenderingContext2D, x0: number, x1: number, baseY: number, h: number, col: string): void {
  ctx.fillStyle = col;
  const inset = (x1 - x0) * 0.24 + 8;
  for (let r = 0; r <= h; r++) {
    const frac = r / h;
    const off = (1 - Math.pow(frac, 0.55)) * inset; // concave, sweeping curve
    const y = baseY - h + r;
    ctx.fillRect(Math.round(x0 - 8 + off), y, Math.round(x1 - x0 + 16 - off * 2), 1);
  }
  // Upturned eave tips
  ctx.fillRect(x0 - 11, baseY - 2, 3, 1);
  ctx.fillRect(x0 - 12, baseY - 3, 2, 1);
  ctx.fillRect(x1 + 8, baseY - 2, 3, 1);
  ctx.fillRect(x1 + 10, baseY - 3, 2, 1);
}

function drawRider(ctx: CanvasRenderingContext2D, hx: number, hy: number, t: number): void {
  const ink = '#050304';
  const rim = tone(0.42);
  ctx.fillStyle = ink;
  const rect = (x: number, y: number, w: number, h: number) => ctx.fillRect(hx + x, hy + y, w, h);

  // Horse legs (front-right leg paws the ground restlessly)
  const paw = Math.max(0, Math.sin(t * 2.2)) > 0.85 ? 3 : 0;
  rect(-15, -13, 3, 13);
  rect(-10, -13, 3, 13);
  rect(10, -13, 3, 13);
  rect(15, -13 - paw, 3, 13 - paw);
  // Hooves
  rect(-16, -1, 4, 1); rect(-11, -1, 4, 1); rect(9, -1, 4, 1); rect(14, -1 - paw, 4, 1);
  // Body & chest
  rect(-17, -24, 34, 12);
  rect(-16, -25, 30, 1);
  rect(13, -27, 7, 14);
  // Neck rising to the head
  for (let i = 0; i <= 12; i++) rect(15 + Math.round(i * 0.6), -26 - i, 6, 2);
  // Head, muzzle & ears (breathing bob)
  const bob = Math.round(Math.sin(t * 1.6));
  rect(21, -42 + bob, 10, 6);
  rect(28, -39 + bob, 6, 5);
  rect(22, -45 + bob, 2, 3);
  rect(25, -44 + bob, 2, 2);
  // Mane strands blowing in the hot wind
  for (let i = 0; i < 6; i++) {
    const m = Math.round(Math.sin(t * 5 + i) * 1.5);
    rect(13 + i - 2 + m, -30 - i * 2, 2, 3);
  }
  // Tail sway
  for (let i = 0; i < 14; i++) {
    const sw = Math.round(Math.sin(t * 2.4 + i * 0.3) * (i * 0.25));
    rect(-19 - Math.round(i * 0.4) + sw, -23 + i, 3, 1);
  }

  // Rider torso, leg, arm
  rect(-3, -40, 9, 16);
  rect(0, -25, 5, 12);
  rect(5, -35, 10, 3);
  rect(14, -34, 2, 2);
  // Head
  rect(-1, -46, 7, 6);
  // Straw hat (kasa) — wide cone
  for (let r = 0; r <= 6; r++) {
    const w = 2 + r * 3.4;
    ctx.fillRect(Math.round(hx + 2.5 - w / 2), hy - 53 + r, Math.round(w), 1);
  }
  // Katana hilt over the shoulder
  for (let i = 0; i < 10; i++) rect(-4 - Math.round(i * 0.6), -31 - i, 2, 1);
  // Haori cloak fluttering behind
  for (let i = 0; i < 12; i++) {
    const fl = Math.round(Math.sin(t * 6 + i * 0.5) * (i * 0.18));
    rect(-4 - i, -39 + Math.round(i * 0.7) + fl, 2, 7 - Math.round(i * 0.35));
  }

  // Firelight rim on the side facing the inferno
  ctx.fillStyle = rim;
  rect(20, -26, 1, 12);
  rect(33, -39 + bob, 1, 5);
  rect(31, -42 + bob, 1, 3);
  rect(6, -40, 1, 6);
  rect(6, -46, 1, 5);
  for (let r = 0; r <= 6; r++) ctx.fillRect(Math.round(hx + 2.5 + (2 + r * 3.4) / 2), hy - 53 + r, 1, 1);
  rect(18, -13, 1, 12 - paw);
}

function drawBurningEstate(ctx: CanvasRenderingContext2D, t: number): void {
  const pan = Math.round(t * 1.4);

  // Sky lit from below by the blaze
  for (let y = 0; y < VIEW_H; y++) {
    const glow = Math.max(0, 1 - Math.abs(y - 114) / 82);
    const flick = 0.035 * Math.sin(t * 9 + y * 0.05);
    ctx.fillStyle = tone(0.05 + glow * 0.34 + flick * glow);
    ctx.fillRect(0, y, VIEW_W, 1);
  }

  // Pale moon half-swallowed by smoke
  disc(ctx, 52 - pan * 0.3, 44, 12, tone(0.82));
  disc(ctx, 52 - pan * 0.3, 44, 16, tone(0.82, 0.12));

  // Rolling smoke plumes
  for (let i = 0; i < 16; i++) {
    const ph = (t * 0.07 + i / 16) % 1;
    const x = 140 + ((i * 37) % 160) - ph * 70 - pan;
    const y = 120 - ph * 116;
    disc(ctx, x, y, 7 + ph * 24, tone(0.2, 0.42 * (1 - ph)));
  }

  // Distant hills
  ctx.fillStyle = tone(0.07);
  for (let x = 0; x < VIEW_W; x++) {
    const h = Math.round(Math.sin((x + pan) * 0.03) * 4 + Math.cos((x + pan) * 0.07) * 2 + 8);
    ctx.fillRect(x, 124 - h, 1, h + 4);
  }

  // Inferno halo behind the estate
  disc(ctx, 220 - pan, 112, 70, tone(0.6, 0.08));
  disc(ctx, 220 - pan, 112, 46, tone(0.75, 0.1));

  // Estate silhouettes
  const ox = -pan;
  const sil = tone(0.03);
  ctx.fillStyle = sil;
  // Compound wall
  ctx.fillRect(96 + ox, 118, 240, 10);
  japaneseRoof(ctx, 98 + ox, 330 + ox, 118, 3, sil);
  // Side hall
  ctx.fillStyle = sil;
  ctx.fillRect(122 + ox, 104, 44, 16);
  japaneseRoof(ctx, 122 + ox, 166 + ox, 104, 10, sil);
  // Main hall
  ctx.fillStyle = sil;
  ctx.fillRect(176 + ox, 92, 94, 28);
  japaneseRoof(ctx, 176 + ox, 270 + ox, 92, 16, sil);
  // Three-tier pagoda
  for (let tier = 0; tier < 3; tier++) {
    const w = 22 - tier * 5;
    const by = 104 - tier * 14;
    ctx.fillStyle = sil;
    ctx.fillRect(292 - w / 2 + ox, by, w, 14);
    japaneseRoof(ctx, Math.round(292 - w / 2 + ox), Math.round(292 + w / 2 + ox), by, 6, sil);
  }
  ctx.fillRect(291 + ox, 52, 2, 10);

  // Windows glowing with fire inside
  for (let i = 0; i < 6; i++) {
    const wx = 184 + i * 14 + ox;
    const v = 0.7 + 0.25 * Math.sin(t * 13 + i * 2.3);
    ctx.fillStyle = tone(v);
    ctx.fillRect(wx, 100, 6, 9);
    ctx.fillStyle = sil;
    ctx.fillRect(wx + 2, 100, 1, 9);
  }
  ctx.fillStyle = tone(0.8 + 0.2 * Math.sin(t * 15));
  ctx.fillRect(134 + ox, 109, 6, 6);
  ctx.fillRect(150 + ox, 109, 6, 6);

  // Flames devouring the roofs
  flames(ctx, 166 + ox, 280 + ox, 82, 26, t, 1);
  flames(ctx, 118 + ox, 170 + ox, 96, 15, t, 7);
  flames(ctx, 282 + ox, 302 + ox, 66, 12, t, 13);
  flames(ctx, 100 + ox, 320 + ox, 116, 6, t, 21);

  // Rising embers
  for (let i = 0; i < 46; i++) {
    const ph = (t * 0.22 + hash(i)) % 1;
    const x = 120 + hash(i * 3.1) * 190 + Math.sin(t * 2 + i) * 6 - ph * 40 - pan;
    const y = 120 - ph * 118;
    if (hash(i + Math.floor(t * 12)) > 0.25) {
      ctx.fillStyle = tone(ph < 0.5 ? 1 : 0.75);
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }

  // Dark field catching flickering firelight
  for (let y = 128; y < VIEW_H; y++) {
    ctx.fillStyle = tone(0.09 - (y - 128) * 0.0015 + 0.02 * Math.sin(t * 10 + y));
    ctx.fillRect(0, y, VIEW_W, 1);
  }

  // Foreground knoll (pure silhouette)
  ctx.fillStyle = '#050304';
  for (let x = 0; x < VIEW_W; x++) {
    const gy = Math.round(150 - Math.max(0, 1 - Math.abs(x - 70) / 140) * 6 + Math.sin(x * 0.2) * 1);
    ctx.fillRect(x, gy, 1, VIEW_H - gy);
    if (x % 3 === 0) {
      const sway = Math.round(Math.sin(t * 3 + x * 0.3) * 1.2);
      ctx.fillRect(x + sway, gy - 3, 1, 3);
    }
  }

  drawRider(ctx, 70, 145, t);
}

// ─── Scene 2: The Avenger's Eyes ─────────────────────────────────────────────

function drawEye(ctx: CanvasRenderingContext2D, cx: number, cy: number, dir: 1 | -1, t: number): void {
  const half = 17;
  // Almond sclera, inner corner lowered for a grim, focused glare
  for (let dx = -half; dx <= half; dx++) {
    const n = dx / half;
    const h = Math.round(4.6 * Math.sqrt(1 - n * n));
    const tilt = Math.round(n * dir * -2.2);
    ctx.fillStyle = tone(0.5 + 0.08 * (dx * dir > 0 ? 1 : 0));
    ctx.fillRect(cx + dx, cy - h + tilt, 1, h * 2);
    // Heavy upper lid line
    ctx.fillStyle = tone(0.0);
    ctx.fillRect(cx + dx, cy - h + tilt - 2, 1, 2);
  }
  // Iris & pupil
  disc(ctx, cx + dir * 1, cy, 5, tone(0.14));
  disc(ctx, cx + dir * 1, cy, 2.6, tone(0.0));
  // Reflected fire flickering in the iris
  const f = 0.7 + 0.3 * Math.sin(t * 14 + cx);
  ctx.fillStyle = tone(f);
  ctx.fillRect(cx + dir - 3, cy + 2, 2, 1);
  ctx.fillRect(cx + dir - 1, cy + 3, 3, 1);
  // Gleam
  const g = Math.max(0, Math.sin(t * 1.4 - 0.6));
  ctx.fillStyle = tone(1);
  ctx.fillRect(cx + dir + 1, cy - 3, 2, 2);
  if (g > 0.55) {
    const len = Math.round((g - 0.55) * 18);
    ctx.fillStyle = tone(1, 0.85);
    ctx.fillRect(cx + dir + 2 - len, cy - 2, len * 2 + 1, 1);
    ctx.fillRect(cx + dir + 2, cy - 2 - len, 1, len * 2 + 1);
  }
  // Brow, angled down toward the nose
  ctx.fillStyle = tone(0.0);
  for (let dx = -half - 2; dx <= half; dx++) {
    const n = (dx + half) / (half * 2);
    const by = cy - 12 + Math.round((dir === 1 ? n : 1 - n) * 4);
    ctx.fillRect(cx + dx, by, 1, 3);
  }
}

function drawEyesCloseup(ctx: CanvasRenderingContext2D, t: number): void {
  const zoom = 1 + t * 0.03;
  ctx.save();
  ctx.translate(160, 96);
  ctx.scale(zoom, zoom);
  ctx.translate(-160, -96);

  ctx.fillStyle = tone(0.02);
  ctx.fillRect(-40, -40, VIEW_W + 80, VIEW_H + 80);

  // Face in deep shadow, lit faintly by distant fire from the right
  for (let y = 70; y < 200; y++) {
    const jaw = y > 128 ? (y - 128) * 1.1 : 0;
    const x0 = 58 + jaw;
    const x1 = 262 - jaw;
    for (let x = Math.round(x0); x < x1; x += 4) {
      const lit = Math.max(0, (x - 160) / 110) * 0.08;
      ctx.fillStyle = tone(0.1 + lit + 0.015 * Math.sin(t * 9 + y * 0.1));
      ctx.fillRect(x, y, 4, 1);
    }
  }
  // Nose bridge shading
  ctx.fillStyle = tone(0.06);
  ctx.fillRect(157, 96, 2, 30);
  ctx.fillStyle = tone(0.2);
  ctx.fillRect(160, 98, 1, 28);
  ctx.fillRect(152, 126, 16, 1);
  // Grim mouth
  ctx.fillStyle = tone(0.02);
  ctx.fillRect(142, 146, 36, 2);
  ctx.fillRect(140, 147, 3, 1);
  ctx.fillRect(177, 147, 3, 1);

  drawEye(ctx, 118, 96, 1, t);
  drawEye(ctx, 202, 96, -1, t);

  // Shadow cast by the hat brim across the brow
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = tone(0.0, 0.7 - i * 0.055);
    ctx.fillRect(-40, 76 + i, VIEW_W + 80, 1);
  }

  // Straw hat (kasa) looming over the frame
  for (let x = -40; x < VIEW_W + 40; x++) {
    const d = Math.abs(x - 160) / 170;
    const brim = Math.round(76 + d * d * 26);
    ctx.fillStyle = tone(0.11);
    ctx.fillRect(x, -40, 1, brim + 40);
    // Woven straw ribs radiating from the crown
    const rib = Math.round((x - 160) * 0.35);
    if (rib % 5 === 0) {
      ctx.fillStyle = tone(0.17);
      ctx.fillRect(x, -40, 1, brim + 38);
    }
    // Firelit rim of the brim
    ctx.fillStyle = tone(0.3 + Math.max(0, (x - 160) / 300) + 0.05 * Math.sin(t * 11 + x * 0.1));
    ctx.fillRect(x, brim - 1, 1, 1);
  }
  // Weave cross-hatching
  ctx.fillStyle = tone(0.07);
  for (let y = 4; y < 76; y += 6) ctx.fillRect(-40, y, VIEW_W + 80, 1);

  // Drifting ash in front of the lens
  for (let i = 0; i < 26; i++) {
    const ph = (t * 0.12 + hash(i * 1.7)) % 1;
    const x = hash(i * 5.3) * VIEW_W + Math.sin(t + i) * 8;
    const y = ph * VIEW_H;
    ctx.fillStyle = tone(0.55, 0.7);
    ctx.fillRect(Math.round(x), Math.round(y), i % 4 === 0 ? 2 : 1, 1);
  }

  ctx.restore();
}

// ─── Film Treatment: grain, scratches, flicker, vignette, letterbox ─────────

function filmFX(ctx: CanvasRenderingContext2D, frame: number): void {
  let s = (frame * 7919 + 1) % 2147483646 + 1;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;

  ctx.fillStyle = `rgba(0,0,0,${(rnd() * 0.1).toFixed(3)})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,246,226,0.10)' : 'rgba(0,0,0,0.20)';
    ctx.fillRect(Math.floor(rnd() * VIEW_W), Math.floor(rnd() * VIEW_H), 1, 1);
  }
  if (rnd() < 0.4) {
    ctx.fillStyle = 'rgba(240,230,210,0.16)';
    ctx.fillRect(Math.floor(rnd() * VIEW_W), 0, 1, VIEW_H);
  }
  if (rnd() < 0.12) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.6)' : 'rgba(250,240,220,0.4)';
    ctx.fillRect(Math.floor(rnd() * VIEW_W), Math.floor(rnd() * VIEW_H), 2, 2);
  }

  const vg = ctx.createRadialGradient(160, 90, 55, 160, 90, 200);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.78)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, VIEW_W, BAR_TOP);
  ctx.fillRect(0, VIEW_H - BAR_BOTTOM, VIEW_W, BAR_BOTTOM);
}

/** Draws the current intro shot onto the 320×180 game canvas (quantized to 24fps). */
export function drawIntro(ctx: CanvasRenderingContext2D, scene: number, t: number): void {
  const tq = Math.floor(t * FILM_FPS) / FILM_FPS;
  if (scene === 0) drawBurningEstate(ctx, tq);
  else drawEyesCloseup(ctx, tq);

  const dur = INTRO_SCENES[scene].dur;
  const fade = Math.max(0, 1 - tq / 0.9, 1 - (dur - tq) / 0.9);
  if (fade > 0) {
    ctx.fillStyle = `rgba(0,0,0,${Math.min(1, fade).toFixed(3)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  filmFX(ctx, Math.floor(t * FILM_FPS) + scene * 1000);
}

/** Draws the subtitle in the lower letterbox bar on the (pre-scaled) UI canvas. */
export function drawIntroSubtitle(uictx: CanvasRenderingContext2D, scene: number, t: number): void {
  const { dur, text } = INTRO_SCENES[scene];
  const a = Math.max(0, Math.min(1, (t - 1.1) / 0.9, (dur - t) / 0.6));
  if (a <= 0) return;
  uictx.save();
  uictx.font = 'italic 9px "Yuji Syuku", Georgia, serif';
  uictx.textAlign = 'center';
  uictx.textBaseline = 'middle';
  uictx.fillStyle = `rgba(0,0,0,${a.toFixed(3)})`;
  uictx.fillText(text, VIEW_W / 2 + 0.6, VIEW_H - BAR_BOTTOM / 2 + 0.6);
  uictx.fillStyle = `rgba(245,238,222,${a.toFixed(3)})`;
  uictx.fillText(text, VIEW_W / 2, VIEW_H - BAR_BOTTOM / 2);
  uictx.restore();
}

// ─── Instructions Card ───────────────────────────────────────────────────────

export function drawInstructionsUI(uictx: CanvasRenderingContext2D, t: number, time: number): void {
  uictx.save();
  uictx.fillStyle = 'rgba(8, 5, 12, 0.72)';
  uictx.fillRect(0, 0, VIEW_W, VIEW_H);

  const px = 46, py = 22, pw = VIEW_W - 92, ph = VIEW_H - 44;
  uictx.fillStyle = 'rgba(20, 12, 24, 0.92)';
  uictx.fillRect(px, py, pw, ph);
  uictx.strokeStyle = PAL.gold;
  uictx.lineWidth = 1;
  uictx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
  uictx.strokeStyle = PAL.crimson;
  uictx.lineWidth = 0.7;
  uictx.strokeRect(px + 3, py + 3, pw - 6, ph - 6);

  uictx.textBaseline = 'middle';
  uictx.textAlign = 'center';
  uictx.font = '12px "Yuji Syuku", Georgia, serif';
  uictx.fillStyle = PAL.gold;
  uictx.fillText('The Way of the Blade', VIEW_W / 2, py + 14);
  uictx.fillStyle = PAL.crimson;
  uictx.fillRect(VIEW_W / 2 - 50, py + 22, 100, 1);

  const rows: [string, string][] = [
    ['MOVE', 'A / D   or   ← / →'],
    ['JUMP', 'Space / W     (S + Space: drop)'],
    ['SLASH', 'J / X'],
    ['IAIJUTSU DASH', 'K / Shift'],
    ['PARRY', 'L / Z   — stuns, empowers next strike'],
  ];
  uictx.font = 'bold 6px monospace';
  rows.forEach(([k, v], i) => {
    const y = py + 34 + i * 11;
    uictx.textAlign = 'right';
    uictx.fillStyle = PAL.orange;
    uictx.fillText(k, VIEW_W / 2 - 22, y);
    uictx.textAlign = 'left';
    uictx.fillStyle = PAL.cream;
    uictx.fillText(v, VIEW_W / 2 - 14, y);
  });

  uictx.textAlign = 'center';
  uictx.font = 'italic 7px "Yuji Syuku", Georgia, serif';
  uictx.fillStyle = PAL.cream;
  uictx.fillText('Slay every foe to open the path onward.', VIEW_W / 2, py + 94);
  uictx.font = 'bold 5px monospace';
  uictx.fillStyle = '#9a8aa8';
  uictx.fillText('R: Retry seed     N: New seed     M: Mute', VIEW_W / 2, py + 104);

  const pulse = Math.sin(time * 4) * 0.5 + 0.5;
  uictx.font = '8px "Yuji Syuku", Georgia, serif';
  uictx.fillStyle = pulse > 0.5 ? '#fffdf5' : PAL.gold;
  uictx.fillText('— Press any key to begin —', VIEW_W / 2, py + ph - 12);

  // Brief white flash as the card appears
  if (t < 0.35) {
    uictx.fillStyle = `rgba(255,250,235,${(1 - t / 0.35).toFixed(3)})`;
    uictx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  uictx.restore();
}

// ─── Final Boss Cutscene (First-Person POV at the Cliff Edge) ────────────────

export const FINAL_CUTSCENE_DUR = 7.4;
const FINAL_BAR_TOP = 14;
const FINAL_BAR_BOTTOM = 38;

function drawCliffBossPOV(ctx: CanvasRenderingContext2D, t: number, pandaMad: boolean): void {
  // Subtle first-person breathing & step-forward camera push
  const push = Math.min(1, t * 0.14);
  const breatheY = Math.sin(t * 2.1) * 0.8;

  ctx.save();
  ctx.translate(160, 88 + breatheY);
  ctx.scale(1 + push * 0.06, 1 + push * 0.06);
  ctx.translate(-160, -88);

  // 1. Night Sky & Horizon Glow over the Distant Mountain Range
  for (let y = 0; y < VIEW_H; y++) {
    const horizonGlow = Math.max(0, 1 - Math.abs(y - 88) / 68);
    ctx.fillStyle = tone(0.04 + horizonGlow * 0.24);
    ctx.fillRect(0, y, VIEW_W, 1);
  }

  // Stars in upper sky
  for (let i = 0; i < 32; i++) {
    const sx = (i * 61 + 19) % VIEW_W;
    const sy = (i * 23 + 11) % 66;
    if (hash(i + Math.floor(t * 4)) > 0.25) {
      ctx.fillStyle = tone(0.75);
      ctx.fillRect(sx, sy, 1, 1);
    }
  }

  // Huge Luminous Moon overlooking the mountain valley
  disc(ctx, 232, 42, 24, tone(0.85, 0.08));
  disc(ctx, 232, 42, 18, tone(0.88, 0.16));
  disc(ctx, 232, 42, 14, tone(0.95));
  disc(ctx, 229, 40, 3, tone(0.82));
  disc(ctx, 236, 45, 4, tone(0.82));

  // 2. Towering Distant Mountain (Mt. Fuji & Jagged Peaks) Across the Abyss
  const peakX = 96;
  const peakY = 38;
  const mtBaseY = 98;
  for (let dy = 0; dy <= mtBaseY - peakY; dy++) {
    const y = peakY + dy;
    const frac = dy / (mtBaseY - peakY);
    const spanL = Math.round(9 + Math.pow(frac, 1.45) * 92);
    const spanR = Math.round(9 + Math.pow(frac, 1.42) * 96);
    const split = peakX + Math.round(dy * 0.1);
    ctx.fillStyle = tone(0.14);
    ctx.fillRect(peakX - spanL, y, split - (peakX - spanL), 1);
    ctx.fillStyle = tone(0.22); // Moonlit right slope
    ctx.fillRect(split, y, peakX + spanR - split, 1);

    // Snow cap ridges
    if (dy < 22) {
      for (let x = peakX - spanL; x < peakX + spanR; x++) {
        const gully = Math.sin((x - peakX) * 0.3) * 4;
        if (dy < 16 + gully) {
          ctx.fillStyle = tone(x >= split ? 0.88 : 0.62);
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }

  // Rolling Sea of Clouds below the cliff edge (y = 86..118)
  for (let band = 0; band < 4; band++) {
    const cy = 88 + band * 7;
    const drift = (t * (4 + band * 2.5)) % 48;
    for (let cx = -24; cx < VIEW_W + 24; cx += 22) {
      const puffX = cx - drift + (band % 2) * 11;
      disc(ctx, puffX, cy, 10 + (band % 2) * 3, tone(0.32 - band * 0.05, 0.45));
    }
  }

  // 3. First-Person Perspective Cliff Precipice Ledge (Receding to y = 114)
  const cliffEdgeY = 114;
  for (let y = cliffEdgeY; y < VIEW_H; y++) {
    const p = (y - cliffEdgeY) / (VIEW_H - cliffEdgeY);
    const halfW = Math.round(78 + p * 125);
    const lx = 160 - halfW;
    const rx = 160 + halfW;

    // Dark cliff drop-off on far left/right
    ctx.fillStyle = tone(0.06);
    ctx.fillRect(0, y, VIEW_W, 1);

    // Moonlit stone cliff path in first-person perspective
    ctx.fillStyle = tone(0.16 - p * 0.06);
    ctx.fillRect(lx, y, rx - lx, 1);

    // Craggy cliff brink rim-highlight at the precipice
    if (y <= cliffEdgeY + 2) {
      ctx.fillStyle = tone(0.45);
      ctx.fillRect(lx + 4, y, rx - lx - 8, 1);
    }

    // Perspective stone cracks & windswept grass tufts
    if (y % 6 === 0) {
      ctx.fillStyle = tone(0.08);
      ctx.fillRect(160 - Math.round(halfW * 0.6), y, Math.round(halfW * 1.2), 1);
    }
  }

  // 4. The Clan Head Standing at the Cliff Edge with His Back to Us!
  const bx = 160;
  const by = cliffEdgeY + 4; // Feet planted right at the cliff brink
  const wind = Math.sin(t * 7.5);

  // Ground shadow beneath the massive Clan Head
  ctx.fillStyle = tone(0.02);
  ctx.fillRect(bx - 26, by - 2, 52, 4);

  // Thick sumo legs & waraji sandals planted wide
  ctx.fillStyle = tone(0.05);
  ctx.fillRect(bx - 18, by - 16, 12, 16);
  ctx.fillRect(bx + 6, by - 16, 12, 16);

  // Massive Sumo / Buddha Torso & Broad Muscular Back (seen from behind)
  for (let dy = 14; dy <= 52; dy++) {
    const y = by - dy;
    const torsoCurve = Math.sin(((dy - 14) / 38) * Math.PI);
    const halfW = Math.round(19 + torsoCurve * 9);
    // Deep ink silhouette core with moonlit right rim
    ctx.fillStyle = tone(0.08);
    ctx.fillRect(bx - halfW, y, halfW * 2, 1);
    // Subtle muscular back shoulder blades & spine crease
    ctx.fillStyle = tone(0.14);
    ctx.fillRect(bx - halfW + 3, y, halfW - 5, 1);
    ctx.fillRect(bx + 2, y, halfW - 4, 1);
    // Moonlit rim on right shoulder/back
    ctx.fillStyle = tone(0.52);
    ctx.fillRect(bx + halfW - 1, y, 1, 1);
  }

  // Broad Head, Thick Ears & Traditional Topknot (Chonmage) from Behind
  disc(ctx, bx, by - 58, 9, tone(0.1));
  // Moonlit rim on right side of head
  ctx.fillStyle = tone(0.55);
  ctx.fillRect(bx + 7, by - 63, 2, 9);
  // Topknot bun & fluttering hair tail in the wind
  ctx.fillStyle = tone(0.03);
  ctx.fillRect(bx - 3, by - 69, 6, 5);
  ctx.fillStyle = tone(0.45);
  ctx.fillRect(bx - 3, by - 65, 6, 1); // gold hair tie
  for (let i = 0; i < 8; i++) {
    const wy = Math.round(Math.sin(t * 11 + i * 0.6) * 1.5);
    ctx.fillStyle = tone(0.04);
    ctx.fillRect(bx + 2 + i, by - 68 + wy, 2, 2);
  }

  // Flowing Open Haori Robes & Cape Billowing Dramatically in the Mountain Wind!
  for (let dy = 6; dy <= 48; dy++) {
    const y = by - dy;
    const f = (48 - dy) / 42; // 0 at shoulders, 1 at bottom hem
    const billow = Math.round(
      f * 22 + Math.sin(t * 9.5 - f * 4.5) * (3 + f * 6) + Math.cos(t * 5.2 + dy * 0.2) * 2,
    );
    const leftEdge = bx - 24 + Math.round(Math.sin(t * 8 - f * 3) * (2 + f * 3));
    const rightEdge = bx + 22 + billow;

    // Dark flowing silk robe body
    ctx.fillStyle = tone(0.04);
    ctx.fillRect(leftEdge, y, rightEdge - leftEdge, 1);

    // Dynamic wind folds & pleats rippling across the back of the robe
    const fold1 = bx - 10 + Math.round(billow * 0.35);
    const fold2 = bx + 6 + Math.round(billow * 0.65);
    ctx.fillStyle = tone(0.16);
    ctx.fillRect(fold1, y, 2, 1);
    ctx.fillRect(fold2, y, 2, 1);

    // Bright moonlit silver trim along the collar, bottom hem, and whipping right edge
    if (dy >= 46 || dy <= 9) {
      ctx.fillStyle = tone(0.62);
      ctx.fillRect(leftEdge, y, rightEdge - leftEdge, 1);
    } else {
      ctx.fillStyle = tone(0.68);
      ctx.fillRect(rightEdge - 1, y, 2, 1);
      ctx.fillStyle = tone(0.32);
      ctx.fillRect(leftEdge, y, 1, 1);
    }
  }

  // Long Flowing Waist Sash (Obi) Ribbons Whipping in the Wind to the Right
  for (let s = 0; s < 26; s++) {
    const sx = bx + 20 + s;
    const sy1 = by - 22 + Math.round(Math.sin(t * 12 - s * 0.35) * (1.5 + s * 0.14));
    const sy2 = by - 17 + Math.round(Math.cos(t * 11 - s * 0.32) * (1.5 + s * 0.16));
    ctx.fillStyle = tone(0.58);
    ctx.fillRect(sx, sy1, 2, 2);
    ctx.fillStyle = tone(0.38);
    ctx.fillRect(sx - 2, sy2, 2, 2);
  }

  // Heavy Kanabo Mace & Odachi Greatsword Silhouette resting at his side
  ctx.fillStyle = tone(0.05);
  ctx.fillRect(bx - 30, by - 38, 6, 36);
  ctx.fillStyle = tone(0.5);
  for (let sy = by - 36; sy <= by - 14; sy += 5) {
    ctx.fillRect(bx - 32, sy, 2, 2);
    ctx.fillRect(bx - 24, sy, 2, 2);
  }

  // If the player killed the panda, dark trembling rage aura rises from his shoulders!
  if (pandaMad) {
    for (let i = 0; i < 18; i++) {
      const ph = (t * 1.4 + hash(i * 2.3)) % 1;
      const ax = bx + (hash(i * 7.1) - 0.5) * 56 + Math.sin(t * 14 + i) * 3;
      const ay = by - 12 - ph * 58;
      ctx.fillStyle = tone(0.85, (1 - ph) * 0.65);
      ctx.fillRect(Math.round(ax), Math.round(ay), 2, 3);
    }
  }

  // 5. Wind Gust Streaks & Autumn Leaves Blowing Past in First-Person POV
  for (let i = 0; i < 24; i++) {
    const ph = (t * 0.45 + hash(i * 4.1)) % 1;
    const lx = Math.round(ph * (VIEW_W + 40) - 20);
    const ly = Math.round(24 + hash(i * 9.3) * 115 + Math.sin(t * 6 + i) * 7);
    ctx.fillStyle = tone(i % 3 === 0 ? 0.85 : 0.45);
    ctx.fillRect(lx, ly, 2, 1);
    if (i % 5 === 0) {
      ctx.fillStyle = tone(0.65, 0.22);
      ctx.fillRect(lx - 14, ly, 14, 1);
    }
  }

  // 6. Subtle First-Person Foreground Framing: Our Drawn Katana Blade at Bottom-Right
  const bladeBob = Math.round(wind * 1.2);
  for (let i = 0; i < 44; i++) {
    const kx = 248 + i * 1.5;
    const ky = VIEW_H - FINAL_BAR_BOTTOM - 2 - Math.round(i * 0.55) + bladeBob;
    ctx.fillStyle = tone(0.12);
    ctx.fillRect(Math.round(kx), ky, 6, 4);
    ctx.fillStyle = tone(0.88);
    ctx.fillRect(Math.round(kx), ky, 5, 1); // Gleaming katana edge
  }

  ctx.restore();
}

export function drawFinalCutscene(ctx: CanvasRenderingContext2D, t: number, pandaMad: boolean): void {
  const tq = Math.floor(t * FILM_FPS) / FILM_FPS;
  drawCliffBossPOV(ctx, tq, pandaMad);

  const fade = Math.max(0, 1 - tq / 0.7, 1 - (FINAL_CUTSCENE_DUR - tq) / 0.7);
  if (fade > 0) {
    ctx.fillStyle = `rgba(0,0,0,${Math.min(1, fade).toFixed(3)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  filmFX(ctx, Math.floor(t * FILM_FPS) + 5000);
  // Taller bottom letterbox bar so 3 lines of dialogue fit cleanly
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, VIEW_W, FINAL_BAR_TOP);
  ctx.fillRect(0, VIEW_H - FINAL_BAR_BOTTOM, VIEW_W, FINAL_BAR_BOTTOM);
}

export function drawFinalCutsceneSubtitle(
  uictx: CanvasRenderingContext2D,
  t: number,
  pandaMad: boolean,
): void {
  const fadeOut = Math.max(0, Math.min(1, (FINAL_CUTSCENE_DUR - t) / 0.5));
  if (fadeOut <= 0) return;

  uictx.save();
  uictx.textBaseline = 'middle';
  const baseY = VIEW_H - FINAL_BAR_BOTTOM;

  if (pandaMad) {
    // Panda Killed Route:
    // Line 1: "You killed my innocent panda..."
    // Line 2: "for that, you shall SUFFER."
    const a1 = Math.max(0, Math.min(1, (t - 0.4) / 0.6)) * fadeOut;
    const a2 = Math.max(0, Math.min(1, (t - 2.3) / 0.6)) * fadeOut;

    if (a1 > 0) {
      uictx.font = '8.5px "Yuji Syuku", Georgia, serif';
      uictx.textAlign = 'center';
      uictx.fillStyle = `rgba(0,0,0,${a1.toFixed(3)})`;
      uictx.fillText('You killed my innocent panda...', VIEW_W / 2 + 0.6, baseY + 12.6);
      uictx.fillStyle = `rgba(245,238,222,${a1.toFixed(3)})`;
      uictx.fillText('You killed my innocent panda...', VIEW_W / 2, baseY + 12);
    }
    if (a2 > 0) {
      uictx.font = 'bold 9.5px "Yuji Syuku", Georgia, serif';
      uictx.textAlign = 'center';
      uictx.fillStyle = `rgba(0,0,0,${a2.toFixed(3)})`;
      uictx.fillText('for that, you shall SUFFER.', VIEW_W / 2 + 0.6, baseY + 26.6);
      uictx.fillStyle = `rgba(223,62,35,${a2.toFixed(3)})`;
      uictx.fillText('for that, you shall SUFFER.', VIEW_W / 2, baseY + 26);
    }
  } else {
    // Normal Route:
    // Line 1: "So you're finally here..."
    // Line 2: "What a shame to have come all this way..."
    // Line 3: "only to die" ("die" in italics)
    const a1 = Math.max(0, Math.min(1, (t - 0.4) / 0.6)) * fadeOut;
    const a2 = Math.max(0, Math.min(1, (t - 2.1) / 0.6)) * fadeOut;
    const a3 = Math.max(0, Math.min(1, (t - 3.9) / 0.6)) * fadeOut;

    if (a1 > 0) {
      uictx.font = '8px "Yuji Syuku", Georgia, serif';
      uictx.textAlign = 'center';
      uictx.fillStyle = `rgba(0,0,0,${a1.toFixed(3)})`;
      uictx.fillText("So you're finally here...", VIEW_W / 2 + 0.6, baseY + 8.6);
      uictx.fillStyle = `rgba(245,238,222,${a1.toFixed(3)})`;
      uictx.fillText("So you're finally here...", VIEW_W / 2, baseY + 8);
    }
    if (a2 > 0) {
      uictx.font = '8px "Yuji Syuku", Georgia, serif';
      uictx.textAlign = 'center';
      uictx.fillStyle = `rgba(0,0,0,${a2.toFixed(3)})`;
      uictx.fillText('What a shame to have come all this way...', VIEW_W / 2 + 0.6, baseY + 19.6);
      uictx.fillStyle = `rgba(245,238,222,${a2.toFixed(3)})`;
      uictx.fillText('What a shame to have come all this way...', VIEW_W / 2, baseY + 19);
    }
    if (a3 > 0) {
      const prefix = 'only to ';
      const italicWord = 'die';
      uictx.font = '8.5px "Yuji Syuku", Georgia, serif';
      const wPrefix = uictx.measureText(prefix).width;
      uictx.font = 'italic bold 9px "Yuji Syuku", Georgia, serif';
      const wDie = uictx.measureText(italicWord).width;
      const startX = VIEW_W / 2 - (wPrefix + wDie) / 2;

      uictx.textAlign = 'left';
      uictx.font = '8.5px "Yuji Syuku", Georgia, serif';
      uictx.fillStyle = `rgba(0,0,0,${a3.toFixed(3)})`;
      uictx.fillText(prefix, startX + 0.6, baseY + 30.6);
      uictx.fillStyle = `rgba(245,238,222,${a3.toFixed(3)})`;
      uictx.fillText(prefix, startX, baseY + 30);

      uictx.font = 'italic bold 9px "Yuji Syuku", Georgia, serif';
      uictx.fillStyle = `rgba(0,0,0,${a3.toFixed(3)})`;
      uictx.fillText(italicWord, startX + wPrefix + 0.6, baseY + 30.6);
      uictx.fillStyle = `rgba(223,62,35,${a3.toFixed(3)})`;
      uictx.fillText(italicWord, startX + wPrefix, baseY + 30);
    }
  }

  uictx.restore();
}

// ─── Victory Cutscene: Hero Kneels on the Cliff Staring at the Sky ───────────

export const VICTORY_CUTSCENE_DUR = 6.2;

function drawKneelingHeroScene(ctx: CanvasRenderingContext2D, t: number): void {
  // Slow upward camera drift toward the heavens as the hero gazes at the sky
  const panUp = Math.min(8, t * 1.4);

  ctx.save();
  ctx.translate(0, Math.round(panUp));

  // 1. Deep Starry Night Sky & Serene Moonlit Zenith
  for (let y = -16; y < VIEW_H; y++) {
    const skyFrac = Math.max(0, Math.min(1, (y + 16) / 150));
    ctx.fillStyle = tone(0.03 + skyFrac * 0.18);
    ctx.fillRect(0, y, VIEW_W, 1);
  }

  // Abundant twinkling stars across the vast sky
  for (let i = 0; i < 55; i++) {
    const sx = (i * 59 + 13) % VIEW_W;
    const sy = ((i * 31 + 5) % 96) - 12;
    if (hash(i + Math.floor(t * 3)) > 0.2) {
      ctx.fillStyle = tone(i % 4 === 0 ? 0.95 : 0.68);
      ctx.fillRect(sx, sy, 1, 1);
    }
  }

  // Luminous Full Moon directly above in the center-sky, bathing the hero in silver light
  const mx = 160;
  const my = 32;
  disc(ctx, mx, my, 34, tone(0.85, 0.06));
  disc(ctx, mx, my, 24, tone(0.88, 0.12));
  disc(ctx, mx, my, 17, tone(0.92, 0.22));
  disc(ctx, mx, my, 13, tone(0.98));
  disc(ctx, mx - 3, my - 2, 3, tone(0.84));
  disc(ctx, mx + 4, my + 3, 4, tone(0.84));

  // Distant Mountain Range & Sea of Clouds below the cliff edge
  for (let x = 0; x < VIEW_W; x++) {
    const mh = Math.round(
      Math.sin(x * 0.025) * 10 + Math.cos(x * 0.06) * 6 + Math.max(0, 22 - Math.abs(x - 72) * 0.35),
    );
    ctx.fillStyle = tone(0.11);
    ctx.fillRect(x, 106 - mh, 1, mh + 12);
  }

  for (let band = 0; band < 3; band++) {
    const cy = 102 + band * 6;
    const drift = (t * (3 + band * 2)) % 44;
    for (let cx = -20; cx < VIEW_W + 20; cx += 20) {
      disc(ctx, cx - drift + (band % 2) * 10, cy, 9 + (band % 2) * 3, tone(0.28 - band * 0.04, 0.4));
    }
  }

  // 2. High Cliff Precipice Ground (Hero Kneeling at the Edge)
  const cliffY = 122;
  for (let y = cliffY; y < VIEW_H; y++) {
    const p = (y - cliffY) / (VIEW_H - cliffY);
    ctx.fillStyle = tone(0.14 - p * 0.08);
    ctx.fillRect(0, y, VIEW_W, 1);
    if (y === cliffY || y === cliffY + 1) {
      ctx.fillStyle = tone(0.42);
      ctx.fillRect(18, y, VIEW_W - 36, 1);
    }
  }
  // Swaying cliff grass tufts around the kneeling hero
  for (let x = 24; x < VIEW_W - 24; x += 7) {
    const sway = Math.round(Math.sin(t * 2.6 + x * 0.2) * 1.2);
    ctx.fillStyle = tone(0.25);
    ctx.fillRect(x + sway, cliffY - 2, 1, 3);
  }

  // 3. The Hero Kneeling to the Ground with His Back to Us, Staring at the Sky
  const hx = 160;
  const hy = 136; // Kneeling base on the cliff
  const breathe = Math.round(Math.sin(t * 1.8) * 0.6);

  // Soft ground shadow beneath the kneeling samurai
  ctx.fillStyle = tone(0.02);
  ctx.fillRect(hx - 18, hy - 1, 38, 3);

  // Kneeling Hakama (folded legs & tucked feet seen from behind)
  ctx.fillStyle = tone(0.05);
  ctx.fillRect(hx - 13, hy - 9, 26, 9);
  ctx.fillStyle = tone(0.12);
  ctx.fillRect(hx - 11, hy - 8, 10, 6); // Left folded hakama pleat
  ctx.fillRect(hx + 1, hy - 8, 10, 6);  // Right folded hakama pleat
  // Tucked waraji sandal heels at the back
  ctx.fillStyle = tone(0.24);
  ctx.fillRect(hx - 9, hy - 3, 4, 3);
  ctx.fillRect(hx + 5, hy - 3, 4, 3);

  // Samurai Torso & Haori Coat (Back to Us, slightly bowed at first then steady)
  const kneelDrop = t < 0.7 ? Math.round((0.7 - t) * 8) : 0;
  const ty = hy - 9 - kneelDrop + breathe;

  ctx.fillStyle = tone(0.06);
  ctx.fillRect(hx - 10, ty - 18, 20, 19);
  // Moonlit shoulder rims on left and right
  ctx.fillStyle = tone(0.58);
  ctx.fillRect(hx - 10, ty - 18, 10, 1);
  ctx.fillRect(hx + 1, ty - 18, 9, 1);
  ctx.fillRect(hx - 10, ty - 18, 1, 14);
  ctx.fillRect(hx + 9, ty - 18, 1, 14);

  // Left arm resting on knee; Right arm extended holding the planted katana hilt
  ctx.fillStyle = tone(0.07);
  ctx.fillRect(hx - 13, ty - 15, 3, 12);
  ctx.fillRect(hx + 10, ty - 15, 7, 4);
  ctx.fillStyle = tone(0.45);
  ctx.fillRect(hx + 16, ty - 15, 3, 3); // Right hand gripping pommel

  // Katana Planted Vertically into the Cliff Ground Beside Him
  const kx = hx + 17;
  ctx.fillStyle = tone(0.75);
  ctx.fillRect(kx, ty - 12, 2, 21); // Gleaming steel blade
  ctx.fillStyle = tone(0.95);
  ctx.fillRect(kx, ty - 12, 1, 21); // Moonlit blade edge
  ctx.fillStyle = tone(0.62);
  ctx.fillRect(kx - 2, ty - 13, 6, 2); // Tsuba handguard
  ctx.fillStyle = tone(0.18);
  ctx.fillRect(kx, ty - 20, 2, 7); // Wrapped tsuka hilt

  // Straw Hat (Kasa) Slung Across His Upper Back so His Head Is Uncovered to Gaze at the Sky
  const hatX = hx - 2;
  const hatY = ty - 9;
  disc(ctx, hatX, hatY, 9, tone(0.18));
  disc(ctx, hatX, hatY, 8, tone(0.11));
  ctx.fillStyle = tone(0.48);
  ctx.fillRect(hatX - 7, hatY - 8, 14, 1); // Moonlit top rim of the slung straw hat
  disc(ctx, hatX, hatY, 2, tone(0.28));

  // Hero's Head Tilted Backward, Staring Upward at the Starry Sky!
  const headY = ty - 24;
  ctx.fillStyle = tone(0.04);
  ctx.fillRect(hx - 4, headY, 8, 6); // Back of head & dark samurai hair
  // Upturned forehead & nose bridge catching the bright moonlight from straight above
  ctx.fillStyle = tone(0.78);
  ctx.fillRect(hx - 3, headY - 2, 6, 2);
  ctx.fillRect(hx - 1, headY - 3, 2, 1);
  // Topknot tail & hair strands blowing gently to the right
  for (let i = 0; i < 6; i++) {
    const wy = Math.round(Math.sin(t * 7 + i * 0.7) * 1);
    ctx.fillStyle = tone(0.04);
    ctx.fillRect(hx + 2 + i, headY + 1 + wy, 2, 2);
  }

  // Flowing Scarf / Haori Ribbon Billowing Softly in the Night Breeze
  for (let s = 0; s < 20; s++) {
    const sx = hx + 7 + s;
    const sy = ty - 16 + Math.round(Math.sin(t * 8 - s * 0.35) * (1 + s * 0.12));
    ctx.fillStyle = tone(0.52);
    ctx.fillRect(sx, sy, 2, 2);
  }

  // Rising Spirit Motes / Autumn Petals Drifting Upward Toward the Stars
  for (let i = 0; i < 22; i++) {
    const ph = (t * 0.18 + hash(i * 3.7)) % 1;
    const px = hx + (hash(i * 6.1) - 0.5) * 180 + Math.sin(t * 2 + i) * 8;
    const py = 128 - ph * 130;
    ctx.fillStyle = tone(0.88, (1 - ph) * 0.75);
    ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
  }

  ctx.restore();
}

export function drawVictoryCutscene(ctx: CanvasRenderingContext2D, t: number): void {
  const tq = Math.floor(t * FILM_FPS) / FILM_FPS;
  drawKneelingHeroScene(ctx, tq);

  filmFX(ctx, Math.floor(t * FILM_FPS) + 9000);

  // Fade in from battle (first 0.7s) and smooth fade to solid black at the end (last 1.4s)
  const fadeIn = Math.max(0, 1 - t / 0.7);
  const fadeOut = Math.max(0, 1 - (VICTORY_CUTSCENE_DUR - t) / 1.4);
  const fade = Math.max(fadeIn, fadeOut);
  if (fade > 0) {
    ctx.fillStyle = `rgba(0,0,0,${Math.min(1, fade).toFixed(3)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

export function drawVictoryCutsceneSubtitle(uictx: CanvasRenderingContext2D, t: number): void {
  const a = Math.max(0, Math.min(1, (t - 0.8) / 0.7, (VICTORY_CUTSCENE_DUR - 0.9 - t) / 0.8));
  if (a <= 0) return;
  const text = 'Finally my clan has been avenged!';
  uictx.save();
  uictx.font = 'italic 9.5px "Yuji Syuku", Georgia, serif';
  uictx.textAlign = 'center';
  uictx.textBaseline = 'middle';
  uictx.fillStyle = `rgba(0,0,0,${a.toFixed(3)})`;
  uictx.fillText(text, VIEW_W / 2 + 0.6, VIEW_H - BAR_BOTTOM / 2 + 0.6);
  uictx.fillStyle = `rgba(245,238,222,${a.toFixed(3)})`;
  uictx.fillText(text, VIEW_W / 2, VIEW_H - BAR_BOTTOM / 2);
  uictx.restore();
}


