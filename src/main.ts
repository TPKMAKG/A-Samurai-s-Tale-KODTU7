import { VIEW_W, VIEW_H, TILE, CHUNK_W, FIXED_DT, RUN_LENGTH } from './config';
import { Input } from './engine/input';
import { Camera } from './engine/camera';
import { loadSheetOverrides } from './engine/assets';
import { drawAnim, strokeRectPx } from './engine/render';
import { overlap } from './engine/math';
import { SPRITE_OVERRIDES } from './assets/manifest';
import { generatePlaceholderArt } from './art/placeholders';
import { PAL } from './art/palette';
import { RNG, randomSeed } from './procgen/rng';
import { planChests, planChunkEnemies, type Relic } from './procgen/loot';
import type { ChunkDef } from './world/chunks';
import { Level, generateLayout, drawRoomWaterAndSprings } from './world/level';
import { AutumnBackdrop, FXManager, sfx } from './fx/fx';
import {
  INTRO_SCENES,
  FINAL_CUTSCENE_DUR,
  VICTORY_CUTSCENE_DUR,
  drawIntro,
  drawIntroSubtitle,
  drawInstructionsUI,
  drawFinalCutscene,
  drawFinalCutsceneSubtitle,
  drawVictoryCutscene,
  drawVictoryCutsceneSubtitle,
} from './fx/cutscene';
import {
  Player,
  Enemy,
  PandaNPC,
  pandaKilled,
  setPandaKilled,
  openChest,
  spawnEnemyDrop,
  drawTilemap,
  clearBossProjectiles,
  updateBossProjectiles,
  drawBossProjectiles,
  type Chest,
  type Pickup,
  type LeafWave,
} from './entities/entities';

// ─── Canvas & Viewport Scaling ───────────────────────────────────────────────

const stage = document.getElementById('stage') as HTMLDivElement;
const gameCanvas = document.getElementById('game') as HTMLCanvasElement;
const uiCanvas = document.getElementById('ui') as HTMLCanvasElement;
const ctx = gameCanvas.getContext('2d')!;
const uictx = uiCanvas.getContext('2d')!;
ctx.imageSmoothingEnabled = false;

let scale = 3;
function resize(): void {
  scale = Math.max(1, Math.floor(Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H)));
  const w = VIEW_W * scale;
  const h = VIEW_H * scale;
  stage.style.width = `${w}px`;
  stage.style.height = `${h}px`;
  gameCanvas.style.width = `${w}px`;
  gameCanvas.style.height = `${h}px`;
  uiCanvas.width = w;
  uiCanvas.height = h;
}
window.addEventListener('resize', resize);
resize();

// ─── Run & Isolated Room State ───────────────────────────────────────────────

type Mode =
  | 'title'
  | 'intro'
  | 'instructions'
  | 'final_cutscene'
  | 'victory_cutscene'
  | 'playing'
  | 'dead'
  | 'victory';

let introScene = 0;
let introT = 0;
let instrT = 0;
let finalCutsceneT = 0;
let victoryCutsceneT = 0;
let runTime = 0;

const input = new Input();
const cam = new Camera();
const fx = new FXManager();
const backdrop = new AutumnBackdrop();

let mode: Mode = 'title';
let seed = randomSeed();
let chestRng = new RNG(seed);
let lootRng = new RNG(seed);
let enemyRng = new RNG(seed);
let dropRng = new RNG(seed);

let runRooms: ChunkDef[] = [];
let roomIndex = 0;
let level!: Level;
let player!: Player;
let enemies: Enemy[] = [];
let panda: PandaNPC | null = null;
let chests: Chest[] = [];
let pickups: Pickup[] = [];
let leaves: LeafWave[] = [];

let relicBanner: { relic: Relic; t: number } | null = null;
let roomBanner: { name: string; subtitle: string; t: number } | null = null;

// Fade-to-black transition state between isolated rooms
let fadeState: 'none' | 'out' | 'in' = 'none';
let fadeAlpha = 0;
let pendingRoomIndex = 0;
let debug = false;

function loadRoom(idx: number): void {
  roomIndex = idx;
  const def = runRooms[roomIndex];
  const isFinalBossRoom = roomIndex === runRooms.length - 1;
  level = new Level(def, roomIndex, runRooms.length);

  player.x = (isFinalBossRoom ? 64 : 32) - player.w / 2;
  player.y = 10 * TILE - player.h;
  player.vx = 0;
  player.vy = 0;
  player.dashMarks.length = 0;

  enemies = [];
  pickups = [];
  leaves = [];
  panda = idx === 0 ? new PandaNPC(180, 10 * TILE) : null;
  clearBossProjectiles();
  fx.clear();

  const ch = level.chunks[0];
  ch.activated = true;
  chests = planChests(chestRng, [ch]).map((c) => ({ ...c, open: false }));
  for (const s of planChunkEnemies(enemyRng, ch)) {
    enemies.push(new Enemy(s.x, s.y, s.kind));
  }

  roomBanner = { name: def.name, subtitle: def.subtitle, t: 2.6 };
  cam.snap(player.cx, player.cy, level.pxWidth, level.pxHeight);

  if (isFinalBossRoom) {
    mode = 'final_cutscene';
    finalCutsceneT = 0;
  }
}

function startRun(newSeed: number): void {
  seed = newSeed;
  const master = new RNG(seed);
  const layoutRng = master.fork(1);
  chestRng = master.fork(2);
  enemyRng = master.fork(3);
  lootRng = master.fork(4);
  dropRng = master.fork(5);

  setPandaKilled(false);
  runTime = 0;
  runRooms = generateLayout(layoutRng, RUN_LENGTH);
  player = new Player(32, 10 * TILE);
  relicBanner = null;
  fadeState = 'in';
  fadeAlpha = 1;
  loadRoom(0);
}

// ─── Scenic Title Screen State (Mt. Fuji, Moon, Foreground Tree & Wind Gusts) ─

interface TitleLeaf {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  angle: number;
  spinSpeed: number;
  tumble: number;
  tumbleSpeed: number;
  swayPhase: number;
  color: string;
}

const TITLE_LEAF_COLORS = [PAL.crimson, PAL.red, PAL.orange, PAL.gold, '#d93829', '#ff9b26'];
const titleLeaves: TitleLeaf[] = [];
let titleGustTimer = 1.2;
let titleGustDuration = 0;
let titleGustStrength = 0; // 0 = calm autumn breeze, 1 = strong swirling wind gust
let embarkHover = false;

function spawnTitleLeaf(randomScreenInit: boolean): TitleLeaf {
  // Spawn primarily from the large foreground tree canopy on the right & top-right
  const fromTreeCanopy = Math.random() < 0.72;
  const x = randomScreenInit
    ? Math.random() * (VIEW_W + 40) - 10
    : fromTreeCanopy
      ? 165 + Math.random() * 165
      : 60 + Math.random() * 270;
  const y = randomScreenInit
    ? Math.random() * VIEW_H
    : fromTreeCanopy
      ? -8 + Math.random() * 68
      : -10 - Math.random() * 20;
  return {
    x,
    y,
    vx: -14 - Math.random() * 14,
    vy: 14 + Math.random() * 12,
    size: Math.random() < 0.35 ? 3 : 2,
    angle: Math.random() * Math.PI * 2,
    spinSpeed: (Math.random() * 2.4 + 1.2) * (Math.random() < 0.5 ? 1 : -1),
    tumble: Math.random() * Math.PI * 2,
    tumbleSpeed: 2.5 + Math.random() * 3.5,
    swayPhase: Math.random() * Math.PI * 2,
    color: TITLE_LEAF_COLORS[Math.floor(Math.random() * TITLE_LEAF_COLORS.length)],
  };
}

function initTitleLeaves(): void {
  if (titleLeaves.length > 0) return;
  for (let i = 0; i < 75; i++) {
    titleLeaves.push(spawnTitleLeaf(true));
  }
}
initTitleLeaves();

function updateTitleScreen(dt: number): void {
  // Periodic wind gust state machine
  if (titleGustDuration > 0) {
    titleGustDuration -= dt;
    titleGustStrength = Math.min(1, titleGustStrength + dt * 2.8);
  } else {
    titleGustStrength = Math.max(0, titleGustStrength - dt * 1.8);
    titleGustTimer -= dt;
    if (titleGustTimer <= 0) {
      titleGustDuration = 1.8 + Math.random() * 0.9;
      titleGustTimer = 3.2 + Math.random() * 2.2;
    }
  }

  const g = titleGustStrength;
  for (let i = 0; i < titleLeaves.length; i++) {
    const l = titleLeaves[i];
    l.swayPhase += dt * (2.2 + g * 5.5);

    // During a wind gust, leaves fall quicker, whip leftward, and get spun around in swirling eddies!
    const swirlAngle = l.swayPhase * 1.7 + l.x * 0.04;
    const eddyVx = Math.cos(swirlAngle) * (28 * g);
    const eddyVy = Math.sin(swirlAngle) * (22 * g);

    const windVx = l.vx - g * 68 + Math.sin(l.swayPhase) * 10 + eddyVx;
    const windVy = l.vy + g * 26 + Math.cos(l.swayPhase * 0.8) * 5 + eddyVy;

    l.x += windVx * dt;
    l.y += windVy * dt;
    l.angle += l.spinSpeed * (1 + g * 5.2) * dt;
    l.tumble += l.tumbleSpeed * (1 + g * 4.5) * dt;

    if (l.y > VIEW_H + 12 || l.x < -18) {
      titleLeaves[i] = spawnTitleLeaf(false);
    }
  }
}

function embarkFromTitle(): void {
  if (mode !== 'title') return;
  mode = 'intro';
  introScene = 0;
  introT = 0;
  embarkHover = false;
  sfx.dash();
}

function beginPlay(): void {
  mode = 'playing';
  fadeState = 'in';
  fadeAlpha = 1;
  roomBanner = { name: runRooms[0].name, subtitle: runRooms[0].subtitle, t: 2.6 };
  input.endFrame(); // swallow the key that dismissed the instructions
}

function nextIntroShot(): void {
  introScene++;
  introT = 0;
  if (introScene >= INTRO_SCENES.length) {
    mode = 'instructions';
    instrT = 0;
  }
}

function finishFinalCutscene(): void {
  mode = 'playing';
  fadeState = 'in';
  fadeAlpha = 1;
  input.endFrame();
}

function handleAdvance(): void {
  if (mode === 'title') embarkFromTitle();
  else if (mode === 'intro' && introT > 0.8) nextIntroShot();
  else if (mode === 'instructions' && instrT > 0.5) beginPlay();
  else if (mode === 'final_cutscene' && finalCutsceneT > 4.4) finishFinalCutscene();
  else if (mode === 'victory_cutscene' && victoryCutsceneT > 2.2) {
    mode = 'victory';
    input.endFrame();
  }
}

input.onAnyKey(handleAdvance);

window.addEventListener('mousemove', (e) => {
  if (mode !== 'title') return;
  const rect = gameCanvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) / scale;
  const my = (e.clientY - rect.top) / scale;
  embarkHover = mx >= 68 && mx <= 252 && my >= 116 && my <= 146;
});

window.addEventListener('mousedown', handleAdvance);

// ─── Update Step ─────────────────────────────────────────────────────────────

let worldTime = 0;

function update(dt: number): void {
  worldTime += dt;
  if (input.wasPressed('debug')) {
    debug = !debug;
    if (player) {
      if (debug) player.heal(99);
      fx.popup(
        player.cx,
        player.y - 14,
        debug ? 'DEBUG INVINCIBILITY: ON' : 'DEBUG INVINCIBILITY: OFF',
        debug ? PAL.gold : PAL.cream,
      );
    }
  }
  if (player) player.invincible = debug;
  if (input.wasPressed('mute')) sfx.muted = !sfx.muted;
  const inGame = mode === 'playing' || mode === 'dead' || mode === 'victory';
  if (inGame && input.wasPressed('restart')) { startRun(seed); mode = 'playing'; }
  if (inGame && input.wasPressed('newSeed')) { startRun(randomSeed()); mode = 'playing'; }

  if (mode === 'title') {
    updateTitleScreen(dt);
    return;
  }
  if (mode === 'intro') {
    introT += dt;
    if (introT >= INTRO_SCENES[introScene].dur) nextIntroShot();
    return;
  }
  if (mode === 'instructions') {
    instrT += dt;
    updateTitleScreen(dt);
    return;
  }
  if (mode === 'final_cutscene') {
    finalCutsceneT += dt;
    if (finalCutsceneT >= FINAL_CUTSCENE_DUR) finishFinalCutscene();
    return;
  }
  if (mode === 'victory_cutscene') {
    victoryCutsceneT += dt;
    if (victoryCutsceneT >= VICTORY_CUTSCENE_DUR) {
      mode = 'victory';
    }
    return;
  }

  backdrop.update(dt);
  cam.update(dt);

  if (mode !== 'playing') return;

  runTime += dt;

  // Handle smooth fade-to-black room transition
  if (fadeState === 'out') {
    fadeAlpha = Math.min(1, fadeAlpha + dt * 3.2);
    if (fadeAlpha >= 1) {
      loadRoom(pendingRoomIndex);
      fadeState = 'in';
    }
    return;
  }
  if (fadeState === 'in') {
    fadeAlpha = Math.max(0, fadeAlpha - dt * 3.2);
    if (fadeAlpha <= 0) fadeState = 'none';
  }

  if (fx.hitStop > 0) {
    fx.hitStop -= dt;
    return;
  }

  player.update(dt, input, level, enemies, leaves, fx, cam);

  // Maple Leaf Slash Projectiles
  for (let i = leaves.length - 1; i >= 0; i--) {
    const l = leaves[i];
    l.x += l.vx * dt;
    l.life -= dt;
    const box = { x: l.x - 5, y: l.y - 4, w: 10, h: 8 };
    for (const e of enemies) {
      if (e.hp > 0 && !l.hitIds.has(e.id) && overlap(box, e.rect)) {
        l.hitIds.add(e.id);
        e.takeHit(1, l.x, fx, cam, false);
        fx.burst(e.cx, e.cy, PAL.orange, 6, 70);
      }
    }
    if (l.life <= 0 || level.solidAtPx(l.x, l.y)) leaves.splice(i, 1);
  }

  // Enemies & Bosses
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.update(dt, player, level, fx, cam);
    if (e.hp <= 0 || e.y > level.pxHeight + 48) {
      player.kills++;
      spawnEnemyDrop(e, dropRng, player, pickups);
      if (e.isBoss && e.kind !== 'final_boss') {
        pickups.push({ x: e.cx + 10, y: e.cy, vy: -140, kind: 'onigiri', t: 0 });
        fx.popup(e.cx, e.y - 16, 'MINIBOSS VANQUISHED!', PAL.gold);
      }
      enemies.splice(i, 1);
    }
  }

  if (panda) panda.update(dt, player, leaves, fx, cam);
  updateBossProjectiles(dt, player, enemies, level, fx, cam);

  // Chests
  for (const c of chests) {
    if (c.open) continue;
    const box = { x: c.x - 8, y: c.y - 14, w: 16, h: 14 };
    if (overlap(player.rect, box)) {
      openChest(c, lootRng, pickups, fx);
    }
  }

  // Pickups
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.t += dt;
    p.vy = Math.min(260, p.vy + 520 * dt);
    if (!level.standableAtPx(p.x, p.y + 1)) p.y += p.vy * dt;
    else p.vy = 0;

    const box = { x: p.x - 6, y: p.y - 10, w: 12, h: 10 };
    if (p.t > 0.18 && overlap(player.rect, box)) {
      sfx.pickup();
      if (p.kind === 'onigiri') {
        player.heal(1);
        fx.popup(p.x, p.y - 8, '+1 HP', '#7dff7a');
      } else if (p.kind === 'relic' && p.relic) {
        p.relic.apply(
          player.mods,
          () => player.heal(99),
          () => { if (!debug) player.hp = Math.max(1, player.hp - 1); },
        );
        player.relics.push(p.relic);
        relicBanner = { relic: p.relic, t: 3.4 };
      }
      pickups.splice(i, 1);
    }
  }

  if (relicBanner) {
    relicBanner.t -= dt;
    if (relicBanner.t <= 0) relicBanner = null;
  }
  if (roomBanner) {
    roomBanner.t -= dt;
    if (roomBanner.t <= 0) roomBanner = null;
  }

  fx.update(dt);
  cam.follow(player.cx + player.facing * 24, player.cy, level.pxWidth, level.pxHeight, dt);

  if (player.y > level.pxHeight + 32) {
    if (debug) {
      player.x = 64;
      player.y = 6 * TILE;
      player.vy = 0;
    } else {
      player.hp = 0;
    }
  }
  if (player.hp <= 0) mode = 'dead';

  // Isolated Room Exit Transition -> Hero MUST kill all spawned enemies before passing the stage!
  const isFinalRoom = roomIndex === runRooms.length - 1;
  if (!isFinalRoom && fadeState === 'none' && Math.abs(player.cx - level.exitX) < 16) {
    if (enemies.length === 0) {
      pendingRoomIndex = roomIndex + 1;
      fadeState = 'out';
      sfx.dash();
    } else if (fx.texts.length === 0) {
      fx.popup(
        level.exitX,
        player.y - 12,
        `DEFEAT ALL ENEMIES! (${enemies.length} LEFT)`,
        PAL.crimson,
      );
    }
  }

  // Final Boss Cliff Room: Trigger Victory Cutscene when the Final Boss is killed!
  if (isFinalRoom && enemies.length === 0) {
    mode = 'victory_cutscene';
    victoryCutsceneT = 0;
    sfx.chest();
  }
}

// ─── Scenic Title Screen Artwork (Mt. Fuji, Moon, Foreground Tree & Leaves) ──

function drawTitleScene(): void {
  // 1. Scenic Night-to-Twilight Sky Bands
  const skyBands = [
    { y: 0, h: 26, col: '#0b0714' },
    { y: 26, h: 24, col: '#140e24' },
    { y: 50, h: 24, col: '#1f1633' },
    { y: 74, h: 24, col: '#2d1d40' },
    { y: 98, h: 22, col: '#3e2447' },
    { y: 120, h: 20, col: '#542c49' },
    { y: 140, h: 40, col: '#140f21' },
  ];
  for (const b of skyBands) {
    ctx.fillStyle = b.col;
    ctx.fillRect(0, b.y, VIEW_W, b.h);
  }

  // Twinkling Stars in the night sky
  for (let i = 0; i < 38; i++) {
    const sx = (i * 53 + 17) % (VIEW_W - 40);
    const sy = (i * 29 + 7) % 92;
    const twinkle = Math.sin(worldTime * (1.8 + (i % 4) * 0.6) + i) * 0.5 + 0.5;
    if (twinkle > 0.35) {
      ctx.fillStyle = twinkle > 0.8 ? '#fff9e6' : '#a89cc8';
      ctx.fillRect(sx, sy, 1, 1);
    }
  }

  // 2. Luminous Full Moon with Atmospheric Glow & Craters
  const moonX = 64;
  const moonY = 44;
  const moonR = 23;
  // Outer halos
  const drawDisc = (cx: number, cy: number, r: number, color: string) => {
    ctx.fillStyle = color;
    for (let dy = -r; dy <= r; dy++) {
      const span = Math.floor(Math.sqrt(r * r - dy * dy));
      ctx.fillRect(cx - span, cy + dy, span * 2 + 1, 1);
    }
  };
  drawDisc(moonX, moonY, moonR + 18, 'rgba(247, 233, 190, 0.05)');
  drawDisc(moonX, moonY, moonR + 10, 'rgba(247, 233, 190, 0.10)');
  drawDisc(moonX, moonY, moonR + 4, 'rgba(247, 233, 190, 0.18)');
  drawDisc(moonX, moonY, moonR, '#fbf5e3');
  drawDisc(moonX - 2, moonY - 2, moonR - 3, '#fffdf5');
  // Subtle lunar seas (mare)
  drawDisc(moonX - 7, moonY - 5, 5, '#ebe2c8');
  drawDisc(moonX + 6, moonY + 4, 6, '#ebe2c8');
  drawDisc(moonX - 2, moonY + 9, 4, '#e3d7b7');

  // High altitude drifting silver cloud wisps near the moon & sky
  const cloudShift = (worldTime * 3.5) % 360;
  ctx.fillStyle = 'rgba(235, 220, 235, 0.16)';
  ctx.fillRect(Math.round(32 + Math.sin(worldTime * 0.4) * 6), 54, 48, 2);
  ctx.fillRect(Math.round(42 + Math.sin(worldTime * 0.4) * 6), 56, 36, 1);
  ctx.fillRect(Math.round(170 - (cloudShift % 80) * 0.3), 38, 54, 2);

  // 3. Iconic Mount Fuji in the Far Background
  const peakX = 132;
  const peakY = 54;
  const baseY = 136;
  const fujiH = baseY - peakY;

  for (let dy = 0; dy <= fujiH; dy++) {
    const y = peakY + dy;
    const t = dy / fujiH;
    // Authentic concave volcanic curve of Mt. Fuji
    const leftSpan = Math.round(10 + Math.pow(t, 1.48) * 112);
    const rightSpan = Math.round(10 + Math.pow(t, 1.45) * 116);
    const lx = peakX - leftSpan;
    const rx = peakX + rightSpan;

    // Shadowed right slope & moonlit left slope
    const ridgeSplit = peakX - Math.round(Math.sin(dy * 0.12) * 3) + Math.round(dy * 0.08);
    ctx.fillStyle = '#382c52'; // Moonlit left slope
    ctx.fillRect(lx, y, ridgeSplit - lx, 1);
    ctx.fillStyle = '#211833'; // Deep twilight right slope
    ctx.fillRect(ridgeSplit, y, rx - ridgeSplit, 1);

    // Jagged Snow Cap on Mt. Fuji's summit and upper gullies
    const snowBase = 24;
    if (dy <= snowBase + 12) {
      for (let x = lx; x < rx; x++) {
        const relX = x - peakX;
        // Create 5 natural snow gullies running down the volcanic ribs
        const gully = Math.sin(relX * 0.32) * 5 + Math.cos(relX * 0.15) * 4;
        if (dy <= snowBase + gully) {
          ctx.fillStyle = x < ridgeSplit ? '#f6f3ec' : '#c9cde3';
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }

  // Distant foothills & misty lake at the base of Mt. Fuji
  for (let x = 0; x < VIEW_W; x++) {
    const hillH = Math.round(Math.sin(x * 0.035) * 5 + Math.cos(x * 0.08) * 3 + 8);
    ctx.fillStyle = '#181126';
    ctx.fillRect(x, 136 - hillH, 1, hillH + 8);
  }

  // Rolling layers of valley mist below Mt. Fuji
  const mistDrift = Math.round(Math.sin(worldTime * 0.7) * 8);
  ctx.fillStyle = 'rgba(218, 198, 228, 0.14)';
  ctx.fillRect(0, 128, VIEW_W, 5);
  ctx.fillStyle = 'rgba(218, 198, 228, 0.22)';
  ctx.fillRect(10 + mistDrift, 132, 240, 4);
  ctx.fillRect(30 - mistDrift, 136, 210, 3);

  // Tranquil dark lake at bottom-left reflecting the Moon & Mt. Fuji
  ctx.fillStyle = '#110c1c';
  ctx.fillRect(0, 140, VIEW_W, 40);
  for (let ry = 143; ry < 176; ry += 2) {
    const shimmerW = Math.max(4, 26 - (ry - 143) * 0.5 + Math.sin(worldTime * 3 + ry) * 3);
    const shimmerX = moonX + Math.sin(worldTime * 2 + ry * 0.7) * 2;
    ctx.fillStyle = ry % 4 === 0 ? 'rgba(251, 245, 227, 0.35)' : 'rgba(249, 194, 43, 0.20)';
    ctx.fillRect(Math.round(shimmerX - shimmerW / 2), ry, Math.round(shimmerW), 1);

    // Subtle snowy Fuji reflection
    const fujiRefW = Math.max(8, 42 - (ry - 143));
    ctx.fillStyle = 'rgba(201, 205, 227, 0.12)';
    ctx.fillRect(Math.round(peakX - fujiRefW / 2), ry, Math.round(fujiRefW), 1);
  }

  // Distant silhouette of a shoreline Torii gate on the left peninsula
  ctx.fillStyle = '#0a0612';
  ctx.fillRect(0, 146, 56, 6);
  const tx = 28;
  const ty = 134;
  ctx.fillStyle = '#2b1321';
  ctx.fillRect(tx - 7, ty, 14, 2);
  ctx.fillRect(tx - 9, ty - 1, 18, 1);
  ctx.fillRect(tx - 5, ty + 3, 10, 1);
  ctx.fillRect(tx - 4, ty + 1, 2, 12);
  ctx.fillRect(tx + 2, ty + 1, 2, 12);

  // 4. Foreground Promontory & Large Ancient Autumn Tree on the Right
  const sway = Math.round(Math.sin(worldTime * 2.5) * (1 + titleGustStrength * 3));

  // Rocky mossy foreground knoll on the right (`x = 205..320, y = 146..180`)
  for (let x = 198; x < VIEW_W; x++) {
    const t = (x - 198) / (VIEW_W - 198);
    const groundY = Math.round(176 - Math.pow(t, 0.65) * 32 + Math.sin(x * 0.15) * 2);
    ctx.fillStyle = '#0d0814';
    ctx.fillRect(x, groundY, 1, VIEW_H - groundY);
    ctx.fillStyle = '#231528';
    ctx.fillRect(x, groundY, 1, 2);
    // Swaying grass blades along the ridge
    if (x % 4 === 0) {
      ctx.fillStyle = '#382039';
      ctx.fillRect(x - Math.round(titleGustStrength * 2), groundY - 3, 1, 3);
    }
  }

  // Gnarled ancient tree trunk & sweeping boughs
  const drawBranch = (x0: number, y0: number, x1: number, y1: number, r0: number, r1: number) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) {
      const p = i / steps;
      const bx = Math.round(x0 + (x1 - x0) * p + Math.sin(p * Math.PI) * 3);
      const by = Math.round(y0 + (y1 - y0) * p);
      const r = Math.max(1, Math.round(r0 + (r1 - r0) * p));
      // Bark shadow & moonlit left rim highlight
      ctx.fillStyle = '#160c14';
      ctx.fillRect(bx - r, by - r, r * 2 + 1, r * 2 + 1);
      ctx.fillStyle = '#2d1822';
      ctx.fillRect(bx - r, by - r, Math.max(1, r), r * 2);
      ctx.fillStyle = '#4d2b36';
      ctx.fillRect(bx - r, by - r, 1, Math.max(1, r));
    }
  };

  // Main trunk rising from the foreground knoll and leaning gracefully toward Mt. Fuji
  drawBranch(288, 158, 274, 108, 12, 9);
  drawBranch(274, 108, 262, 62, 9, 7);
  drawBranch(262, 62, 246 - sway, 24, 7, 4);
  // Roots gripping the cliff
  drawBranch(280, 152, 256, 162, 5, 2);
  drawBranch(292, 154, 312, 164, 6, 2);
  // Sweeping canopy boughs extending across the upper-right sky
  drawBranch(268, 86, 224 - sway, 54, 5, 2);
  drawBranch(224 - sway, 54, 188 - sway * 2, 42, 3, 1);
  drawBranch(262, 62, 212 - sway, 26, 5, 2);
  drawBranch(212 - sway, 26, 174 - sway * 2, 16, 2, 1);
  drawBranch(270, 74, 308, 44, 5, 2);
  drawBranch(252, 36, 296, 12, 4, 2);

  // Lush Layered Autumn Canopy Clusters (swaying with the wind!)
  const canopyClusters = [
    { x: 184, y: 16, rx: 22, ry: 10 },
    { x: 214, y: 24, rx: 28, ry: 13 },
    { x: 250, y: 18, rx: 32, ry: 15 },
    { x: 292, y: 14, rx: 30, ry: 16 },
    { x: 194, y: 40, rx: 24, ry: 11 },
    { x: 230, y: 46, rx: 28, ry: 13 },
    { x: 268, y: 42, rx: 26, ry: 13 },
    { x: 304, y: 38, rx: 24, ry: 14 },
    { x: 248, y: 66, rx: 22, ry: 10 },
    { x: 294, y: 62, rx: 24, ry: 11 },
  ];

  const drawFoliageLayer = (dx: number, dy: number, col: string, scaleR: number) => {
    ctx.fillStyle = col;
    for (const c of canopyClusters) {
      const cx = Math.round(c.x + dx - sway * (c.y < 35 ? 1.4 : 1.0));
      const cy = Math.round(c.y + dy);
      const rx = Math.round(c.rx * scaleR);
      const ry = Math.round(c.ry * scaleR);
      for (let py = -ry; py <= ry; py++) {
        const span = Math.round(rx * Math.sqrt(Math.max(0, 1 - (py * py) / (ry * ry))));
        const jag = Math.round(Math.sin((py + cx) * 0.9) * 2);
        ctx.fillRect(cx - span + jag, cy + py, span * 2, 1);
      }
    }
  };

  drawFoliageLayer(2, 3, '#2b0916', 1.05);   // Deep canopy shadow
  drawFoliageLayer(0, 1, '#5e1320', 0.96);   // Dark crimson base
  drawFoliageLayer(-2, 0, PAL.crimson, 0.84); // Rich autumn crimson
  drawFoliageLayer(-4, -1, PAL.red, 0.68);    // Bright scarlet mid-leaves
  drawFoliageLayer(-6, -2, PAL.orange, 0.48); // Sunlit/moonlit orange highlights
  drawFoliageLayer(-8, -3, PAL.gold, 0.26);   // Golden leaf tips on the moonward side

  // 5. Wind Gust Ribbons when a strong gust blows across the scene
  if (titleGustStrength > 0.08) {
    const alpha = (titleGustStrength * 0.28).toFixed(2);
    ctx.fillStyle = `rgba(245, 242, 235, ${alpha})`;
    for (let gIdx = 0; gIdx < 5; gIdx++) {
      const gx = VIEW_W - ((worldTime * 210 + gIdx * 73) % (VIEW_W + 90));
      const gy = 28 + gIdx * 26 + Math.round(Math.sin(gx * 0.05 + gIdx) * 8);
      for (let s = 0; s < 34; s++) {
        const wy = gy + Math.round(Math.sin((gx + s) * 0.08) * 3);
        ctx.fillRect(Math.round(gx + s), wy, 1, 1);
      }
    }
  }

  // 6. Falling & Swirling Autumn Leaves
  for (const l of titleLeaves) {
    const lx = Math.round(l.x);
    const ly = Math.round(l.y);
    // Project 2D spin + 3D tumble so leaves visibly twirl and flip in the wind
    const cosA = Math.cos(l.angle);
    const sinA = Math.sin(l.angle);
    const flip = Math.max(0.35, Math.abs(Math.cos(l.tumble)));
    const dx = Math.round(cosA * l.size);
    const dy = Math.round(sinA * l.size * flip);

    ctx.fillStyle = l.color;
    ctx.fillRect(lx, ly, 2, 1);
    ctx.fillRect(lx + dx, ly + dy, 1, 1);
    ctx.fillRect(lx - dx, ly - dy, 1, 1);
    if (l.size >= 3) {
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(lx, ly - 1, 1, 1);
    }
  }
}

// ─── Stylized Kanji-Calligraphy Title & UI Overlay ───────────────────────────

function drawTitleUI(): void {
  const cx = VIEW_W / 2 - 18; // Framed nicely in the scenic sky above Mt. Fuji, left of the tree trunk
  const titleY = 58;

  uictx.save();

  // Subtle ink brush backdrop wash behind title for legibility
  const washGrad = uictx.createLinearGradient(cx - 115, titleY - 22, cx + 115, titleY + 26);
  washGrad.addColorStop(0, 'rgba(11, 7, 20, 0)');
  washGrad.addColorStop(0.2, 'rgba(11, 7, 20, 0.42)');
  washGrad.addColorStop(0.8, 'rgba(11, 7, 20, 0.42)');
  washGrad.addColorStop(1, 'rgba(11, 7, 20, 0)');
  uictx.fillStyle = washGrad;
  uictx.fillRect(cx - 115, titleY - 20, 230, 44);

  // Decorative Kanji-style upper brush stroke bar with triangular Uroko serif
  uictx.fillStyle = PAL.crimson;
  uictx.beginPath();
  uictx.moveTo(cx - 72, titleY - 14);
  uictx.lineTo(cx + 64, titleY - 15);
  uictx.lineTo(cx + 70, titleY - 18);
  uictx.lineTo(cx + 75, titleY - 13);
  uictx.lineTo(cx - 74, titleY - 12);
  uictx.closePath();
  uictx.fill();

  // Traditional Vermilion Hanko Stamp Seal ("侍" - Samurai) beside the title
  const sealX = cx + 96;
  const sealY = titleY - 8;
  uictx.fillStyle = '#b4202a';
  uictx.fillRect(sealX, sealY, 15, 15);
  uictx.strokeStyle = '#f5f2eb';
  uictx.lineWidth = 0.8;
  uictx.strokeRect(sealX + 1.2, sealY + 1.2, 12.6, 12.6);
  uictx.font = 'bold 9px "Yuji Syuku", serif';
  uictx.textAlign = 'center';
  uictx.textBaseline = 'middle';
  uictx.fillStyle = '#f5f2eb';
  uictx.fillText('侍', sealX + 7.5, sealY + 8);

  // Main Title: "A Samurai's Tale" in Stylized Kanji-Calligraphy Brush Font
  uictx.font = '900 18px "Yuji Syuku", "Cinzel Decorative", "Georgia", serif';
  uictx.textAlign = 'center';
  uictx.textBaseline = 'middle';

  // Deep sumi-e ink shadow & crimson outer stroke
  uictx.lineJoin = 'miter';
  uictx.miterLimit = 6;
  uictx.strokeStyle = '#09050f';
  uictx.lineWidth = 4.2;
  uictx.strokeText("A Samurai's Tale", cx + 1.2, titleY + 1.5);

  uictx.strokeStyle = '#73172d';
  uictx.lineWidth = 2.2;
  uictx.strokeText("A Samurai's Tale", cx, titleY);

  const titleGrad = uictx.createLinearGradient(cx, titleY - 10, cx, titleY + 10);
  titleGrad.addColorStop(0, '#fffdf5');
  titleGrad.addColorStop(0.55, '#f9c22b');
  titleGrad.addColorStop(1, '#e86a17');
  uictx.fillStyle = titleGrad;
  uictx.fillText("A Samurai's Tale", cx, titleY);

  // Kanji-inspired angular brush flick accents (Uroko wedges) on key letters
  uictx.fillStyle = '#fffdf5';
  const drawUrokoWedge = (wx: number, wy: number, s: number) => {
    uictx.beginPath();
    uictx.moveTo(wx, wy);
    uictx.lineTo(wx + s * 1.6, wy - s * 0.9);
    uictx.lineTo(wx + s * 0.7, wy + s * 0.9);
    uictx.closePath();
    uictx.fill();
  };
  drawUrokoWedge(cx - 84, titleY - 6, 2.2);
  drawUrokoWedge(cx - 56, titleY - 6, 2.2);
  drawUrokoWedge(cx + 38, titleY - 6, 2.2);

  // Sweeping Katana / Sumi-e Brush Slash Underline beneath "A Samurai's Tale"
  uictx.fillStyle = PAL.crimson;
  uictx.beginPath();
  uictx.moveTo(cx - 92, titleY + 13);
  uictx.quadraticCurveTo(cx - 10, titleY + 10, cx + 95, titleY + 12);
  uictx.quadraticCurveTo(cx - 15, titleY + 15, cx - 88, titleY + 16);
  uictx.closePath();
  uictx.fill();

  // Golden katana blade gleam inside the brush underline
  uictx.fillStyle = PAL.gold;
  uictx.beginPath();
  uictx.moveTo(cx - 82, titleY + 13.8);
  uictx.lineTo(cx + 75, titleY + 12.3);
  uictx.lineTo(cx - 65, titleY + 14.6);
  uictx.closePath();
  uictx.fill();

  // ─── Stylized Option: "Embark on your Journey" ─────────────────────────────
  const btnX = VIEW_W / 2 - 12;
  const btnY = 128;
  const pulse = Math.sin(worldTime * 3.2) * 0.5 + 0.5;
  const btnW = embarkHover ? 168 : 160;
  const btnH = 22;

  // Ornate Feudal Lacquer Plaque / Scroll Banner
  uictx.fillStyle = embarkHover ? 'rgba(42, 16, 30, 0.90)' : 'rgba(16, 10, 24, 0.82)';
  uictx.fillRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH);

  // Top & bottom tapered brush borders
  uictx.strokeStyle = embarkHover ? '#fffdf5' : PAL.gold;
  uictx.lineWidth = embarkHover ? 1.4 : 1.0;
  uictx.strokeRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH);

  // Inner crimson silk trim
  uictx.strokeStyle = PAL.crimson;
  uictx.lineWidth = 0.7;
  uictx.strokeRect(btnX - btnW / 2 + 2, btnY - btnH / 2 + 2, btnW - 4, btnH - 4);

  // Stylized Kanji corner brackets on the button
  const drawCornerOrnament = (ox: number, oy: number, sx: number, sy: number) => {
    uictx.fillStyle = PAL.gold;
    uictx.fillRect(ox, oy, sx * 5, sy * 1.3);
    uictx.fillRect(ox, oy, sx * 1.3, sy * 5);
  };
  drawCornerOrnament(btnX - btnW / 2 - 1, btnY - btnH / 2 - 1, 1, 1);
  drawCornerOrnament(btnX + btnW / 2 + 1, btnY - btnH / 2 - 1, -1, 1);
  drawCornerOrnament(btnX - btnW / 2 - 1, btnY + btnH / 2 + 1, 1, -1);
  drawCornerOrnament(btnX + btnW / 2 + 1, btnY + btnH / 2 + 1, -1, -1);

  // Stylized Calligraphic Text: "Embark on your Journey"
  uictx.font = 'bold 9.5px "Yuji Syuku", "Cinzel Decorative", "Georgia", serif';
  uictx.strokeStyle = '#09050f';
  uictx.lineWidth = 2.5;
  uictx.strokeText('❖  Embark on your Journey  ❖', btnX, btnY + 0.5);

  uictx.fillStyle = embarkHover || pulse > 0.6 ? '#fffdf5' : PAL.gold;
  uictx.fillText('❖  Embark on your Journey  ❖', btnX, btnY + 0.5);

  uictx.restore();
}

// ─── Render ──────────────────────────────────────────────────────────────────

function formatRunTime(sec: number): string {
  const mins = Math.floor(sec / 60);
  const remSec = (sec % 60).toFixed(1).padStart(4, '0');
  return `${mins}m ${remSec}s`;
}

function render(): void {
  if (mode === 'victory_cutscene') {
    drawVictoryCutscene(ctx, victoryCutsceneT);
    uictx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
    uictx.save();
    uictx.scale(scale, scale);
    drawVictoryCutsceneSubtitle(uictx, victoryCutsceneT);
    uictx.restore();
    return;
  }
  if (mode === 'final_cutscene') {
    drawFinalCutscene(ctx, finalCutsceneT, pandaKilled);
    uictx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
    uictx.save();
    uictx.scale(scale, scale);
    drawFinalCutsceneSubtitle(uictx, finalCutsceneT, pandaKilled);
    uictx.restore();
    return;
  }
  if (mode === 'intro') {
    drawIntro(ctx, introScene, introT);
    uictx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
    uictx.save();
    uictx.scale(scale, scale);
    drawIntroSubtitle(uictx, introScene, introT);
    uictx.restore();
    return;
  }
  if (mode === 'instructions') {
    drawTitleScene();
    uictx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
    uictx.save();
    uictx.scale(scale, scale);
    drawInstructionsUI(uictx, instrT, worldTime);
    uictx.restore();
    return;
  }
  if (mode === 'title') {
    drawTitleScene();
    uictx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
    uictx.save();
    uictx.scale(scale, scale);
    drawTitleUI();
    uictx.restore();
    return;
  }

  const vx = cam.viewX;
  const vy = cam.viewY;

  // Use shake-free cam.bgX for background layers so distant mountains & forest never vibrate
  backdrop.draw(ctx, cam.bgX, level.theme);

  const isFinalRoom = roomIndex === runRooms.length - 1;
  const gateOpen = isFinalRoom && enemies.length === 0;
  for (const d of level.decor) {
    const key = d.kind === 'gate' ? (gateOpen ? 'decor_gate_open' : 'decor_gate') : `decor_${d.kind}`;
    drawAnim(ctx, key, d.x - vx, d.y - vy, { time: worldTime });
    // Draw a glowing crimson barrier seal across the exit archway until ALL enemies in the stage are slain!
    if (d.kind === 'exit_arch' && enemies.length > 0) {
      const ex = Math.round(d.x - vx);
      const ey = Math.round(d.y - vy);
      ctx.fillStyle = 'rgba(180, 28, 38, 0.55)';
      ctx.fillRect(ex - 8, ey - 30, 16, 30);
      ctx.fillStyle = PAL.crimson;
      ctx.fillRect(ex - 8, ey - 20, 16, 2);
      ctx.fillRect(ex - 8, ey - 10, 16, 2);
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(ex - 2, ey - 17, 4, 5);
    }
  }

  drawTilemap(ctx, level, vx, vy);

  for (const c of chests) {
    drawAnim(ctx, `chest_${c.rarity}_${c.open ? 'open' : 'closed'}`, c.x - vx, c.y - vy);
  }

  for (const p of pickups) {
    const bob = Math.sin(p.t * 6) * 1.5;
    const key = p.kind === 'relic' ? `relic_${p.relic?.rarity ?? 'common'}` : `pickup_${p.kind}`;
    drawAnim(ctx, key, p.x - vx, p.y - vy + bob, { time: p.t });
  }

  for (const l of leaves) {
    ctx.fillStyle = PAL.red;
    ctx.fillRect(Math.round(l.x - vx - 4), Math.round(l.y - vy - 2), 8, 3);
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(Math.round(l.x - vx - 2), Math.round(l.y - vy - 1), 4, 1);
  }

  if (panda) panda.draw(ctx, vx, vy);
  for (const e of enemies) e.draw(ctx, vx, vy, debug);
  drawBossProjectiles(ctx, vx, vy);
  player.draw(ctx, vx, vy, debug);
  drawRoomWaterAndSprings(ctx, level, vx, vy, worldTime);
  fx.draw(ctx, vx, vy);

  // Pixel-art HUD (Hearts)
  for (let i = 0; i < player.maxHp; i++) {
    drawAnim(ctx, i < player.hp ? 'ui_heart_full' : 'ui_heart_empty', 6 + i * 9, 6);
  }

  if (debug) {
    strokeRectPx(ctx, -vx, -vy, CHUNK_W * TILE, level.pxHeight, '#634b7a');
  }

  // Screen Fade-to-Black Overlay during room transitions
  if (fadeAlpha > 0) {
    ctx.fillStyle = `rgba(10, 6, 14, ${fadeAlpha.toFixed(2)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  renderUI(vx, vy);
}

function renderUI(vx: number, vy: number): void {
  uictx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
  uictx.save();
  uictx.scale(scale, scale);
  uictx.font = 'bold 6px monospace';
  uictx.textBaseline = 'top';

  const txt = (s: string, x: number, y: number, col: string = PAL.cream, align: CanvasTextAlign = 'left') => {
    uictx.textAlign = align;
    uictx.fillStyle = PAL.ink;
    uictx.fillText(s, x + 0.7, y + 0.7);
    uictx.fillStyle = col;
    uictx.fillText(s, x, y);
  };

  txt(`KILLS ${player.kills}`, 10 + player.maxHp * 9, 7, PAL.cream);
  txt(`ROOM ${roomIndex + 1}/${runRooms.length}`, VIEW_W - 6, 6, PAL.gold, 'right');

  // Boss Health Bar & Phase Indicator HUD
  const activeBoss = enemies.find((e) => e.isBoss);
  if (activeBoss) {
    let bossTitle = '';
    if (activeBoss.kind === 'priest') {
      bossTitle = `HIGH PRIEST GENKAI  •  PHASE ${activeBoss.phase === 1 ? 'I (IRON FISTS)' : 'II (SPIRIT & KICKS)'}`;
    } else if (activeBoss.kind === 'trainer') {
      bossTitle = `MASTER RETAINER KENSHIN  •  PHASE ${activeBoss.phase === 1 ? 'I (SINGLE KATANA)' : 'II (DUAL KATANAS)'}`;
    } else if (activeBoss.kind === 'cook') {
      bossTitle = `HEAD BUTCHER GORO  •  PHASE ${activeBoss.phase === 1 ? 'I (HEAVY CLEAVER)' : 'II (FLYING KNIVES)'}`;
    } else if (activeBoss.kind === 'final_boss') {
      bossTitle =
        activeBoss.phase === 1
          ? 'CLAN HEAD TAKEDA  •  PHASE I (HEAVY KANABO MACE)'
          : activeBoss.phase === 2
            ? 'CLAN HEAD TAKEDA  •  PHASE II (ODACHI GREATSWORD)'
            : 'CLAN HEAD TAKEDA  •  PHASE III (INVULNERABLE! LURE OFF CLIFF!)';
    }
    const barW = 180;
    const barX = (VIEW_W - barW) / 2;
    const barY = VIEW_H - 14;
    uictx.fillStyle = 'rgba(14, 9, 18, 0.85)';
    uictx.fillRect(barX - 4, barY - 10, barW + 8, 16);
    txt(bossTitle, VIEW_W / 2, barY - 8, activeBoss.phase === 3 ? PAL.gold : PAL.cream, 'center');
    uictx.fillStyle = '#26172e';
    uictx.fillRect(barX, barY, barW, 4);
    const fillW = Math.max(0, Math.round((activeBoss.hp / activeBoss.maxHp) * barW));
    uictx.fillStyle = activeBoss.kind === 'final_boss' && activeBoss.phase === 3 ? PAL.gold : PAL.crimson;
    uictx.fillRect(barX, barY, fillW, 4);
  }

  for (const ft of fx.texts) {
    txt(ft.text, ft.x - vx, ft.y - vy, ft.color, 'center');
  }

  // Room Title Card on entering a new isolated room
  if (roomBanner && !relicBanner) {
    const a = Math.min(1, roomBanner.t * 1.5);
    uictx.fillStyle = `rgba(14, 9, 18, ${(0.72 * a).toFixed(2)})`;
    uictx.fillRect(50, 20, VIEW_W - 100, 22);
    txt(roomBanner.name, VIEW_W / 2, 23, PAL.gold, 'center');
    txt(roomBanner.subtitle, VIEW_W / 2, 32, PAL.cream, 'center');
  }

  if (relicBanner) {
    const r = relicBanner.relic;
    uictx.fillStyle = 'rgba(18, 12, 22, 0.85)';
    uictx.fillRect(36, 22, VIEW_W - 72, 24);
    const col = r.rarity === 'rare' ? PAL.gold : r.rarity === 'cursed' ? '#d98aff' : PAL.cream;
    txt(`RELIC ACQUIRED: ${r.name.toUpperCase()}`, VIEW_W / 2, 26, col, 'center');
    txt(r.desc, VIEW_W / 2, 35, PAL.cream, 'center');
  }

  if (debug) {
    const ch = level.chunks[0];
    txt(
      `[DEBUG • INVINCIBLE]  ROOM: ${level.def.id} (${level.theme})  BOSS: ${ch.bossAnchor?.kind ?? 'none'}  ENEMIES: ${enemies.length}`,
      6,
      VIEW_H - 10,
      '#8fe3ff',
    );
  }

  if (mode !== 'playing') {
    uictx.fillStyle = mode === 'victory' ? '#000000' : 'rgba(14, 9, 18, 0.78)';
    uictx.fillRect(0, 0, VIEW_W, VIEW_H);
    uictx.font = 'bold 11px monospace';
    if (mode === 'dead') {
      txt('YOUR CLAN REMAINS UNAVENGED', VIEW_W / 2, 58, PAL.red, 'center');
      uictx.font = 'bold 6px monospace';
      txt(`Slain in ${level.def.name}  •  Time: ${formatRunTime(runTime)}  •  Kills: ${player.kills}`, VIEW_W / 2, 80, PAL.cream, 'center');
      txt('Press [R] to retry this seed   or   [N] for a new procedural run', VIEW_W / 2, 104, PAL.gold, 'center');
    } else if (mode === 'victory') {
      txt('CONGRATULATIONS — VENGEANCE COMPLETE', VIEW_W / 2, 48, PAL.gold, 'center');
      uictx.font = 'bold 6px monospace';
      txt(`Time Taken: ${formatRunTime(runTime)}   •   Enemies Slain: ${player.kills}`, VIEW_W / 2, 72, PAL.cream, 'center');
      txt(`Relics Collected: ${player.relics.length}`, VIEW_W / 2, 86, PAL.orange, 'center');
      txt('Press [N] to roll a new procedural run   or   [R] to replay seed', VIEW_W / 2, 112, PAL.gold, 'center');
    }
  }

  uictx.restore();
}

// ─── Boot & Fixed-Timestep Loop ──────────────────────────────────────────────

async function boot(): Promise<void> {
  generatePlaceholderArt();
  await loadSheetOverrides(SPRITE_OVERRIDES);
  startRun(seed);

  let last = performance.now();
  let acc = 0;
  const frame = (now: number) => {
    acc = Math.min(0.1, acc + (now - last) / 1000);
    last = now;
    while (acc >= FIXED_DT) {
      update(FIXED_DT);
      input.endFrame();
      acc -= FIXED_DT;
    }
    render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot();
