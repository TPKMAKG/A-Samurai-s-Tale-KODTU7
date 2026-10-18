/**
 * Code-drawn placeholder art. Every key registered here can be overridden by a
 * real sprite sheet via src/assets/manifest.ts — so this file is disposable.
 */
import { PAL } from './palette';
import { makeCanvas, px, rect, line, disc, bitmap } from './draw';
import { registerAnim } from '../engine/assets';
import { hash2 } from '../procgen/rng';

// ─── Characters ──────────────────────────────────────────────────────────────

type Pose = 'idle' | 'run' | 'jump' | 'fall' | 'windup' | 'attack' | 'follow' | 'dash' | 'parry' | 'block' | 'hurt' | 'stun';

interface FigureSpec {
  robe: string;
  robeDark: string;
  hakama: string;
  accent: string;
  hat: 'topknot' | 'kasa' | 'ronin';
  weapon: 'katana' | 'spear';
}

const PLAYER_SPEC: FigureSpec = { robe: '#3a2a4a', robeDark: '#24182f', hakama: '#1e1626', accent: PAL.red, hat: 'topknot', weapon: 'katana' };
const SPEAR_SPEC: FigureSpec = { robe: PAL.indigo, robeDark: '#1f2745', hakama: '#2b2b3a', accent: '#c9a25a', hat: 'kasa', weapon: 'spear' };
const RONIN_SPEC: FigureSpec = { robe: '#5a3050', robeDark: '#3a1e36', hakama: '#241c2a', accent: PAL.steelDark, hat: 'ronin', weapon: 'katana' };

const SHEATH = '#2a1a1a';
const HILT = '#e9dcc0';
const SWORD_POSES: Pose[] = ['windup', 'attack', 'follow', 'parry', 'block', 'dash'];

/** Draws a figure facing right in a 32x32 local space (feet at y=30, center x=16). */
function drawFigure(g: CanvasRenderingContext2D, s: FigureSpec, pose: Pose, f: number): void {
  const bob = pose === 'idle' && f === 1 ? 1 : 0;
  let ux = 0;
  let uy = bob;
  if (pose === 'dash') ux = 2;
  if (pose === 'attack' || pose === 'follow') ux = 1;
  if (pose === 'windup') ux = -1;
  if (pose === 'hurt') {
    ux = -2;
    uy = 1;
  }
  if (pose === 'stun') {
    ux = -1;
    uy = 1;
  }

  // Legs / hakama
  const leg = (x: number, lift: number) => {
    rect(g, x, 22, 5, 7 - lift, s.hakama);
    rect(g, x, 29 - lift, 5, 2, PAL.ink);
  };
  if (pose === 'run') {
    const o = [[-2, 2], [0, 0], [2, -2], [0, 0]][f % 4];
    const l = [[0, 1], [0, 0], [1, 0], [0, 0]][f % 4];
    leg(11 + o[0], l[0]);
    leg(16 + o[1], l[1]);
  } else if (pose === 'jump' || pose === 'fall') {
    rect(g, 11, 22, 10, 5, s.hakama);
    rect(g, 11, 27, 4, 2, PAL.ink);
    rect(g, 17, pose === 'jump' ? 25 : 27, 4, 2, PAL.ink);
  } else if (pose === 'dash') {
    leg(7, 1);
    leg(19, 0);
    rect(g, 11, 22, 9, 4, s.hakama);
  } else {
    rect(g, 11, 22, 10, 7, s.hakama);
    rect(g, 15, 24, 1, 5, PAL.inkSoft);
    rect(g, 11, 29, 4, 2, PAL.ink);
    rect(g, 17, 29, 4, 2, PAL.ink);
  }

  // Torso
  rect(g, 12 + ux, 14 + uy, 8, 9, s.robe);
  rect(g, 12 + ux, 14 + uy, 2, 9, s.robeDark);
  px(g, 15 + ux, 14 + uy, PAL.cream);
  px(g, 16 + ux, 15 + uy, PAL.cream);
  px(g, 17 + ux, 14 + uy, PAL.cream);
  rect(g, 12 + ux, 21 + uy, 8, 2, s.accent);

  // Sheath at the hip (katana users)
  if (s.weapon === 'katana') {
    line(g, 7 + ux, 25 + uy, 16 + ux, 21 + uy, SHEATH);
    if (!SWORD_POSES.includes(pose)) {
      line(g, 17 + ux, 21 + uy, 20 + ux, 19 + uy, HILT);
      px(g, 17 + ux, 21 + uy, PAL.gold);
    }
  }

  // Head
  rect(g, 13 + ux, 7 + uy, 6, 7, PAL.skin);
  rect(g, 13 + ux, 13 + uy, 6, 1, PAL.skinShade);
  px(g, 17 + ux, 10 + uy, PAL.ink);

  // Hair / hats
  if (s.hat === 'topknot') {
    rect(g, 12 + ux, 6 + uy, 7, 2, PAL.ink);
    rect(g, 12 + ux, 6 + uy, 2, 6, PAL.ink);
    rect(g, 14 + ux, 4 + uy, 3, 2, PAL.ink);
    rect(g, 12 + ux, 8 + uy, 7, 1, s.accent);
    const moving = pose === 'run' || pose === 'dash' || pose === 'jump' || pose === 'fall';
    let tail: number[][];
    if (moving) {
      const w = [0, 1, 0, -1][f % 4];
      tail = [[11, 8], [10, 8], [9, 9], [8, 9], [7, 10 + w], [6, 10 + w]];
      if (pose === 'dash') tail.push([5, 9], [4, 9], [3, 10]);
    } else {
      tail = [[11, 8], [11, 9], [10, 10], [10, 11]];
    }
    for (const [tx, ty] of tail) px(g, tx + ux, ty + uy, s.accent);
  } else if (s.hat === 'kasa') {
    px(g, 15 + ux, 3 + uy, PAL.straw);
    px(g, 16 + ux, 3 + uy, PAL.straw);
    for (let i = 0; i < 4; i++) rect(g, 13 - i * 2 + ux, 4 + i + uy, 6 + i * 4, 1, i === 3 ? PAL.strawDark : PAL.straw);
    rect(g, 13 + ux, 8 + uy, 6, 1, PAL.skinShade);
  } else {
    rect(g, 12 + ux, 5 + uy, 7, 3, PAL.ink);
    rect(g, 12 + ux, 5 + uy, 2, 6, PAL.ink);
    for (const [hx, hy] of [[11, 5], [13, 4], [16, 4], [19, 6]]) px(g, hx + ux, hy + uy, PAL.ink);
    rect(g, 10 + ux, 7 + uy, 2, 4, PAL.ink);
  }

  // Arms + weapon
  const arm = s.robeDark;
  const W = PAL.wood;
  if (s.weapon === 'katana') {
    switch (pose) {
      case 'windup':
        rect(g, 15 + ux, 9 + uy, 3, 6, arm);
        rect(g, 15 + ux, 8 + uy, 3, 2, PAL.skin);
        line(g, 16 + ux, 8 + uy, 8 + ux, 0 + uy, PAL.steel);
        line(g, 17 + ux, 8 + uy, 9 + ux, 0 + uy, PAL.steelDark);
        line(g, 16 + ux, 9 + uy, 18 + ux, 11 + uy, PAL.ink);
        break;
      case 'attack':
        rect(g, 18 + ux, 16 + uy, 5, 3, arm);
        rect(g, 23 + ux, 16 + uy, 2, 3, PAL.skin);
        line(g, 25 + ux, 17 + uy, 38 + ux, 14 + uy, PAL.steel);
        line(g, 25 + ux, 18 + uy, 38 + ux, 15 + uy, PAL.steelDark);
        break;
      case 'follow':
        rect(g, 18 + ux, 17 + uy, 4, 4, arm);
        rect(g, 21 + ux, 20 + uy, 2, 2, PAL.skin);
        line(g, 22 + ux, 21 + uy, 32 + ux, 28 + uy, PAL.steel);
        line(g, 23 + ux, 21 + uy, 33 + ux, 28 + uy, PAL.steelDark);
        break;
      case 'dash':
        rect(g, 13 + ux, 17 + uy, 4, 3, arm);
        line(g, 12 + ux, 20 + uy, -2 + ux, 24 + uy, PAL.steel);
        line(g, 12 + ux, 21 + uy, -2 + ux, 25 + uy, PAL.steelDark);
        break;
      case 'parry':
      case 'block':
        rect(g, 18 + ux, 15 + uy, 4, 4, arm);
        rect(g, 21 + ux, 18 + uy, 2, 2, PAL.skin);
        line(g, 22 + ux, 18 + uy, 24 + ux, 3 + uy, PAL.steel);
        line(g, 23 + ux, 18 + uy, 25 + ux, 3 + uy, PAL.steelDark);
        line(g, 22 + ux, 19 + uy, 21 + ux, 22 + uy, PAL.ink);
        break;
      default:
        rect(g, 18 + ux, 15 + uy, 3, 6, arm);
        rect(g, 18 + ux, 21 + uy, 3, 2, PAL.skin);
    }
  } else {
    switch (pose) {
      case 'windup':
        rect(g, 14 + ux, 16 + uy, 4, 3, arm);
        line(g, -6 + ux, 18, 22 + ux, 18, W);
        line(g, 22 + ux, 18, 26 + ux, 18, PAL.steel);
        px(g, 24 + ux, 17, PAL.steel);
        px(g, 24 + ux, 19, PAL.steel);
        break;
      case 'attack':
        rect(g, 18 + ux, 16 + uy, 5, 3, arm);
        line(g, 4 + ux, 17, 34 + ux, 17, W);
        line(g, 34 + ux, 17, 38 + ux, 17, PAL.steel);
        px(g, 36 + ux, 16, PAL.steel);
        px(g, 36 + ux, 18, PAL.steel);
        break;
      default:
        rect(g, 18 + ux, 15 + uy, 3, 6, arm);
        rect(g, 18 + ux, 21 + uy, 3, 2, PAL.skin);
        line(g, 10 + ux, 29, 26 + ux, 4, W);
        line(g, 26 + ux, 4, 28 + ux, 1, PAL.steel);
    }
  }

  if (pose === 'stun') {
    for (const [sx, sy] of [[12, 2], [18, 1], [22, 3]]) {
      px(g, sx, sy, PAL.gold);
      px(g, sx - 1, sy, PAL.amber);
      px(g, sx + 1, sy, PAL.amber);
    }
  }
}

function figureFrame(spec: FigureSpec, pose: Pose, f: number): HTMLCanvasElement {
  const [c, g] = makeCanvas(48, 32);
  g.translate(8, 0);
  drawFigure(g, spec, pose, f);
  return c;
}

function fig(key: string, spec: FigureSpec, poses: [Pose, number][], fps: number, loop = true): void {
  registerAnim(key, {
    frames: poses.map(([p, f]) => figureFrame(spec, p, f)),
    fps,
    loop,
    w: 48,
    h: 32,
    anchorX: 24,
    anchorY: 31,
  });
}

function single(key: string, c: HTMLCanvasElement, anchorX = c.width / 2, anchorY = c.height): void {
  registerAnim(key, { frames: [c], fps: 1, loop: true, w: c.width, h: c.height, anchorX, anchorY });
}

function registerCharacters(): void {
  const RUN: [Pose, number][] = [['run', 0], ['run', 1], ['run', 2], ['run', 3]];
  fig('player_idle', PLAYER_SPEC, [['idle', 0], ['idle', 1]], 2);
  fig('player_run', PLAYER_SPEC, RUN, 12);
  fig('player_jump', PLAYER_SPEC, [['jump', 0]], 1);
  fig('player_fall', PLAYER_SPEC, [['fall', 0]], 1);
  fig('player_attack', PLAYER_SPEC, [['windup', 0], ['attack', 0], ['follow', 0]], 12, false);
  fig('player_dash', PLAYER_SPEC, [['dash', 0]], 1);
  fig('player_parry', PLAYER_SPEC, [['parry', 0]], 1);
  fig('player_hurt', PLAYER_SPEC, [['hurt', 0]], 1);

  fig('spear_idle', SPEAR_SPEC, [['idle', 0], ['idle', 1]], 2);
  fig('spear_walk', SPEAR_SPEC, RUN, 8);
  fig('spear_windup', SPEAR_SPEC, [['windup', 0]], 1);
  fig('spear_attack', SPEAR_SPEC, [['attack', 0]], 1);
  fig('spear_stun', SPEAR_SPEC, [['stun', 0]], 1);
  fig('spear_hurt', SPEAR_SPEC, [['hurt', 0]], 1);

  fig('ronin_idle', RONIN_SPEC, [['idle', 0], ['idle', 1]], 2);
  fig('ronin_walk', RONIN_SPEC, RUN, 10);
  fig('ronin_windup', RONIN_SPEC, [['windup', 0]], 1);
  fig('ronin_attack', RONIN_SPEC, [['attack', 0], ['follow', 0]], 8, false);
  fig('ronin_stun', RONIN_SPEC, [['stun', 0]], 1);
  fig('ronin_block', RONIN_SPEC, [['block', 0]], 1);
  fig('ronin_hurt', RONIN_SPEC, [['hurt', 0]], 1);
}

// ─── Tiles ───────────────────────────────────────────────────────────────────

function registerTiles(): void {
  for (let v = 0; v < 2; v++) {
    // Ground top: dirt with a crust of autumn grass and fallen leaves
    {
      const [c, g] = makeCanvas(16, 16);
      rect(g, 0, 0, 16, 16, PAL.dirt);
      for (let i = 0; i < 10; i++) {
        const x = Math.floor(hash2(i, v, 11) * 16);
        const y = 5 + Math.floor(hash2(i, v, 12) * 11);
        px(g, x, y, PAL.dirtDark);
      }
      for (let x = 0; x < 16; x++) {
        const h = 3 + Math.floor(hash2(x, v, 3) * 2);
        rect(g, x, 0, 1, h, PAL.grass);
        px(g, x, h, PAL.moss);
      }
      rect(g, 0, 0, 16, 1, PAL.amber);
      for (let i = 0; i < 4; i++) {
        const x = Math.floor(hash2(i, v, 21) * 15);
        const col = [PAL.red, PAL.crimson, PAL.gold, PAL.orange][i];
        px(g, x, Math.floor(hash2(i, v, 22) * 3), col);
        px(g, x + 1, Math.floor(hash2(i, v, 22) * 3), col);
      }
      single(`tile_ground_top_${v}`, c, 0, 0);
    }
    // Ground fill
    {
      const [c, g] = makeCanvas(16, 16);
      rect(g, 0, 0, 16, 16, PAL.dirt);
      for (let i = 0; i < 14; i++) {
        px(g, Math.floor(hash2(i, v, 31) * 16), Math.floor(hash2(i, v, 32) * 16), PAL.dirtDark);
      }
      if (v === 1) {
        rect(g, 5, 7, 4, 3, PAL.stoneDark);
        rect(g, 5, 7, 3, 1, PAL.stone);
      }
      single(`tile_ground_fill_${v}`, c, 0, 0);
    }
  }

  {
    const [c, g] = makeCanvas(16, 16);
    rect(g, 0, 0, 16, 4, PAL.wood);
    rect(g, 0, 0, 16, 1, PAL.woodLight);
    rect(g, 0, 4, 16, 1, PAL.bark);
    rect(g, 7, 1, 1, 3, PAL.bark);
    rect(g, 2, 5, 2, 3, PAL.bark);
    rect(g, 12, 5, 2, 3, PAL.bark);
    single('tile_platform', c, 0, 0);
  }

  {
    const [c, g] = makeCanvas(16, 16);
    rect(g, 0, 12, 16, 4, PAL.dirtDark);
    for (let i = 0; i < 4; i++) {
      const x = 1 + i * 4;
      const top = 3 + (i % 2);
      rect(g, x, top + 2, 2, 12 - top, PAL.bamboo);
      px(g, x, top + 1, PAL.bambooLight);
      px(g, x + 1, top, PAL.bambooLight);
      px(g, x, 10, PAL.moss);
    }
    px(g, 6, 6, PAL.blood);
    px(g, 6, 7, PAL.blood);
    single('tile_spike', c, 0, 0);
  }
}

// ─── Decor ───────────────────────────────────────────────────────────────────

function registerDecor(): void {
  {
    const [c, g] = makeCanvas(48, 44);
    rect(g, 2, 3, 44, 3, PAL.ink);
    px(g, 1, 2, PAL.ink);
    px(g, 46, 2, PAL.ink);
    px(g, 0, 1, PAL.ink);
    px(g, 47, 1, PAL.ink);
    rect(g, 4, 6, 40, 2, PAL.red);
    rect(g, 22, 8, 4, 6, PAL.ink);
    rect(g, 6, 14, 36, 3, PAL.red);
    rect(g, 9, 6, 4, 38, PAL.red);
    rect(g, 35, 6, 4, 38, PAL.red);
    rect(g, 9, 6, 1, 38, PAL.crimson);
    rect(g, 35, 6, 1, 38, PAL.crimson);
    rect(g, 8, 40, 6, 4, PAL.ink);
    rect(g, 34, 40, 6, 4, PAL.ink);
    single('decor_torii', c);
  }
  {
    const [c, g] = makeCanvas(12, 22);
    rect(g, 3, 18, 6, 4, PAL.stoneDark);
    rect(g, 5, 11, 2, 7, PAL.stone);
    rect(g, 2, 6, 8, 5, PAL.stone);
    rect(g, 4, 7, 4, 3, PAL.gold);
    rect(g, 1, 4, 10, 2, PAL.stoneDark);
    rect(g, 3, 2, 6, 2, PAL.stoneDark);
    rect(g, 5, 0, 2, 2, PAL.stone);
    single('decor_lantern', c);
  }
  for (const open of [false, true]) {
    const [c, g] = makeCanvas(40, 56);
    rect(g, 2, 8, 5, 48, PAL.bark);
    rect(g, 33, 8, 5, 48, PAL.bark);
    rect(g, 0, 2, 40, 6, PAL.ink);
    for (let x = 1; x < 40; x += 3) px(g, x, 7, PAL.inkSoft);
    if (open) {
      rect(g, 7, 14, 4, 42, PAL.wood);
      rect(g, 29, 14, 4, 42, PAL.wood);
      rect(g, 11, 14, 18, 42, '#0e0a10');
    } else {
      rect(g, 7, 14, 26, 42, PAL.wood);
      rect(g, 19, 14, 2, 42, PAL.bark);
      for (let y = 18; y < 54; y += 8) for (const x of [10, 15, 24, 29]) px(g, x, y, PAL.gold);
      disc(g, 20, 26, 4, PAL.crimson);
      disc(g, 20, 26, 2, PAL.ink);
    }
    single(open ? 'decor_gate_open' : 'decor_gate', c);
  }
}

// ─── Chests & pickups ────────────────────────────────────────────────────────

function registerItems(): void {
  const chestCols = {
    common: { body: PAL.wood, dark: PAL.bark, trim: PAL.steelDark, glow: PAL.cream },
    rare: { body: '#8e1f24', dark: '#3a0e12', trim: PAL.gold, glow: PAL.gold },
    cursed: { body: '#3a2242', dark: '#1e1024', trim: PAL.red, glow: '#c45cff' },
  } as const;
  for (const r of ['common', 'rare', 'cursed'] as const) {
    const col = chestCols[r];
    for (const open of [false, true]) {
      const [c, g] = makeCanvas(16, 16);
      rect(g, 1, 7, 14, 9, col.body);
      rect(g, 1, 14, 14, 2, col.dark);
      rect(g, 1, 7, 14, 1, col.trim);
      rect(g, 2, 8, 1, 7, col.trim);
      rect(g, 13, 8, 1, 7, col.trim);
      if (open) {
        rect(g, 1, 1, 14, 3, col.dark);
        rect(g, 1, 4, 14, 1, col.trim);
        rect(g, 3, 6, 10, 2, col.glow);
      } else {
        rect(g, 2, 2, 12, 1, col.body);
        rect(g, 1, 3, 14, 4, col.body);
        rect(g, 1, 6, 14, 1, col.dark);
        rect(g, 7, 5, 2, 4, col.trim);
      }
      single(`chest_${r}_${open ? 'open' : 'closed'}`, c);
    }
  }

  {
    const [c, g] = makeCanvas(10, 9);
    const widths = [2, 4, 4, 6, 6, 8, 8, 8];
    widths.forEach((w, i) => rect(g, 5 - w / 2, i, w, 1, PAL.white));
    rect(g, 3, 5, 4, 3, '#1e2a1e');
    px(g, 4, 1, PAL.cream);
    single('pickup_onigiri', c);
  }
  {
    const frames: HTMLCanvasElement[] = [];
    for (let f = 0; f < 2; f++) {
      const [c, g] = makeCanvas(8, 8);
      disc(g, 3.5, 3.5, 3.2, '#4fb3d9');
      disc(g, 3.5, 3.5, 2.2, PAL.spirit);
      px(g, f === 0 ? 2 : 4, 2, PAL.white);
      frames.push(c);
    }
    registerAnim('pickup_orb', { frames, fps: 4, loop: true, w: 8, h: 8, anchorX: 4, anchorY: 8 });
  }
  const relicCols = { common: PAL.cream, rare: PAL.gold, cursed: '#c45cff' } as const;
  for (const r of ['common', 'rare', 'cursed'] as const) {
    const [c, g] = makeCanvas(12, 12);
    rect(g, 3, 3, 6, 8, relicCols[r]);
    rect(g, 3, 3, 6, 1, PAL.ink);
    rect(g, 5, 0, 2, 3, PAL.red);
    rect(g, 5, 6, 2, 2, PAL.red);
    rect(g, 3, 10, 6, 1, PAL.ink);
    single(`relic_${r}`, c);
  }
}

// ─── UI & FX ─────────────────────────────────────────────────────────────────

function registerUi(): void {
  const HEART = [' ## ## ', '#######', '#######', ' ##### ', '  ###  ', '   #   '];
  {
    const [c, g] = makeCanvas(7, 6);
    bitmap(g, HEART, { '#': PAL.red });
    px(g, 1, 1, PAL.cream);
    single('ui_heart_full', c, 0, 0);
  }
  {
    const [c, g] = makeCanvas(7, 6);
    bitmap(g, HEART, { '#': PAL.inkSoft });
    single('ui_heart_empty', c, 0, 0);
  }

  // Sword slash crescent (3 frames, fading thinner)
  const frames: HTMLCanvasElement[] = [];
  for (let k = 0; k < 3; k++) {
    const [c, g] = makeCanvas(40, 36);
    const rOuter = 22 + k * 2;
    const thick = [6, 4, 2][k];
    for (let y = 0; y < 36; y++) {
      for (let x = 0; x < 40; x++) {
        const dx = x - 6;
        const dy = y - 18;
        const r = Math.sqrt(dx * dx + dy * dy);
        const ang = Math.atan2(dy, dx);
        if (Math.abs(ang) > 1.25) continue;
        const t = thick * (1 - Math.abs(ang) / 1.35);
        if (r <= rOuter && r >= rOuter - t) {
          const edge = r > rOuter - 1.2;
          px(g, x, y, edge ? PAL.white : k === 0 ? PAL.cream : PAL.amber);
        }
      }
    }
    frames.push(c);
  }
  registerAnim('fx_slash', { frames, fps: 25, loop: false, w: 40, h: 36, anchorX: 6, anchorY: 18 });
}

export function generatePlaceholderArt(): void {
  registerCharacters();
  registerTiles();
  registerDecor();
  registerItems();
  registerUi();
}
