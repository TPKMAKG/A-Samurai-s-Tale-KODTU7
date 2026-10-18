import { VIEW_W, VIEW_H, TILE, CHUNK_W, CHUNK_H } from '../config';
import { overlap, type Rect } from '../engine/math';
import { registerAnim } from '../engine/assets';
import { makeCanvas, rect, px, line, disc } from '../art/draw';
import { PAL } from '../art/palette';
import { hash2, type RNG } from '../procgen/rng';
import {
  ESTATE_ENTRANCE,
  OUTDOOR_CHUNKS,
  PRIEST_TEMPLE,
  TRAINER_COURTYARD,
  COOK_KITCHEN,
  MANSION_CHUNKS,
  CLIFF_BOSS,
  type ChunkDef,
  type RoomTheme,
  type BossSlotKind,
} from './chunks';

export const T = {
  Empty: 0,
  Solid: 1,
  Platform: 2,
  Spike: 3,
} as const;

export type DecorKind =
  | 'torii'
  | 'lantern'
  | 'gate'
  | 'exit_arch'
  | 'maple'
  | 'bamboo'
  | 'temple_bell'
  | 'weapon_rack'
  | 'kitchen_pot'
  | 'shoji'
  | 'cliff_vista'
  | 'swamp_croc';

export interface Decor {
  kind: DecorKind;
  x: number;
  y: number;
}

export interface Anchor {
  x: number;
  y: number;
}

export interface BossAnchor extends Anchor {
  kind: BossSlotKind;
}

export interface HotSpringZone {
  rect: Rect;
  dwellTime: number;
  buffGranted: boolean;
}

export interface ChunkInstance {
  index: number;
  def: ChunkDef;
  x0: number;
  enemyAnchors: Anchor[];
  chestAnchors: Anchor[];
  bossAnchor: BossAnchor | null;
  activated: boolean;
  budget: number;
  isFinal: boolean;
}

// ─── Per-Theme Tile Palettes ─────────────────────────────────────────────────

const THEME_TILES: Record<
  RoomTheme,
  { top: string; crust: string; leaf: string; fill: string; fillDark: string; plat: string; platTop: string }
> = {
  estate: { top: '#7a7268', crust: '#a69d90', leaf: PAL.red, fill: '#3d3632', fillDark: '#292320', plat: PAL.wood, platTop: PAL.woodLight },
  forest: { top: '#9e5424', crust: '#d47a2c', leaf: PAL.crimson, fill: '#36211c', fillDark: '#241411', plat: '#5e3a24', platTop: '#8c5836' },
  bamboo: { top: '#6d8a3c', crust: '#a6b84e', leaf: PAL.gold, fill: '#2c3322', fillDark: '#1c2115', plat: PAL.bamboo, platTop: PAL.bambooLight },
  cave: { top: '#3c4f5e', crust: '#5b7a8c', leaf: PAL.amber, fill: '#1f2833', fillDark: '#141a22', plat: '#4a5560', platTop: '#6e7d8a' },
  temple: { top: '#c99838', crust: '#f7d26a', leaf: PAL.gold, fill: '#4a3828', fillDark: '#302318', plat: '#8e1f24', platTop: '#d6372b' },
  courtyard: { top: '#a8845a', crust: '#cfa878', leaf: PAL.red, fill: '#473628', fillDark: '#2e2218', plat: PAL.wood, platTop: PAL.woodLight },
  kitchen: { top: '#6e4228', crust: '#945b38', leaf: PAL.orange, fill: '#331e14', fillDark: '#21120b', plat: '#523424', platTop: '#784e38' },
  mansion: { top: '#7a6e48', crust: '#ab9b68', leaf: PAL.red, fill: '#2e1d18', fillDark: '#1c100d', plat: '#6b2226', platTop: '#9e3338' },
  cliff: { top: '#584e68', crust: '#8c7ea3', leaf: PAL.crimson, fill: '#231d2e', fillDark: '#14101c', plat: '#4a3630', platTop: '#6e5248' },
};

let themeArtRegistered = false;

function ensureThemeArt(): void {
  if (themeArtRegistered) return;
  themeArtRegistered = true;

  const single = (key: string, c: HTMLCanvasElement, ax = c.width / 2, ay = c.height) => {
    registerAnim(key, { frames: [c], fps: 1, loop: true, w: c.width, h: c.height, anchorX: ax, anchorY: ay });
  };

  (Object.keys(THEME_TILES) as RoomTheme[]).forEach((theme, ti) => {
    const pal = THEME_TILES[theme];
    for (let v = 0; v < 2; v++) {
      const [ct, gt] = makeCanvas(16, 16);
      rect(gt, 0, 0, 16, 16, pal.fill);
      for (let i = 0; i < 10; i++) {
        px(gt, Math.floor(hash2(i, v, ti + 10) * 16), 4 + Math.floor(hash2(i, v, ti + 20) * 12), pal.fillDark);
      }
      for (let x = 0; x < 16; x++) {
        const h = 2 + Math.floor(hash2(x, v, ti + 3) * 2);
        rect(gt, x, 0, 1, h, pal.top);
      }
      rect(gt, 0, 0, 16, 1, pal.crust);
      for (let i = 0; i < 3; i++) {
        const lx = Math.floor(hash2(i, v, ti + 40) * 14);
        rect(gt, lx, 0, 2, 1, pal.leaf);
      }
      single(`tile_top_${theme}_${v}`, ct, 0, 0);

      const [cf, gf] = makeCanvas(16, 16);
      rect(gf, 0, 0, 16, 16, pal.fill);
      for (let i = 0; i < 12; i++) {
        px(gf, Math.floor(hash2(i, v, ti + 50) * 16), Math.floor(hash2(i, v, ti + 60) * 16), pal.fillDark);
      }
      single(`tile_fill_${theme}_${v}`, cf, 0, 0);
    }

    const [cp, gp] = makeCanvas(16, 16);
    rect(gp, 0, 0, 16, 4, pal.plat);
    rect(gp, 0, 0, 16, 1, pal.platTop);
    rect(gp, 0, 4, 16, 1, PAL.ink);
    rect(gp, 3, 5, 2, 2, pal.fillDark);
    rect(gp, 11, 5, 2, 2, pal.fillDark);
    single(`tile_plat_${theme}`, cp, 0, 0);
  });

  // X: Room Exit Archway
  {
    const frames: HTMLCanvasElement[] = [];
    for (let f = 0; f < 2; f++) {
      const [c, g] = makeCanvas(28, 38);
      rect(g, 2, 6, 4, 32, PAL.bark);
      rect(g, 22, 6, 4, 32, PAL.bark);
      rect(g, 0, 2, 28, 5, PAL.ink);
      rect(g, 2, 6, 24, 2, PAL.red);
      rect(g, 6, 8, 16, 30, f === 0 ? 'rgba(242, 163, 58, 0.28)' : 'rgba(247, 210, 106, 0.42)');
      rect(g, 12, 14, 4, 6, PAL.gold);
      px(g, 13, 16, PAL.white);
      frames.push(c);
    }
    registerAnim('decor_exit_arch', { frames, fps: 3, loop: true, w: 28, h: 38, anchorX: 14, anchorY: 38 });
  }

  // F: Autumn Red Maple Tree (Momiji)
  {
    const [c, g] = makeCanvas(36, 44);
    rect(g, 16, 22, 4, 22, PAL.bark);
    line(g, 16, 28, 10, 20, PAL.bark);
    line(g, 19, 26, 26, 18, PAL.bark);
    disc(g, 18, 13, 11, PAL.crimson);
    disc(g, 11, 16, 8, PAL.red);
    disc(g, 25, 15, 8, PAL.orange);
    disc(g, 18, 10, 7, PAL.red);
    for (const [lx, ly] of [[8, 22], [27, 21], [14, 6], [22, 8]]) px(g, lx, ly, PAL.gold);
    single('decor_maple', c);
  }

  // B: Golden Autumn Bamboo Stalks
  {
    const [c, g] = makeCanvas(20, 44);
    for (const [bx, col] of [[5, PAL.bamboo], [10, PAL.bambooLight], [14, PAL.bamboo]] as const) {
      rect(g, bx, 4, 2, 40, col);
      for (let y = 8; y < 40; y += 7) rect(g, bx - 1, y, 4, 1, PAL.moss);
    }
    for (const [lx, ly] of [[2, 10], [7, 6], [16, 12], [12, 18], [3, 22]]) {
      rect(g, lx, ly, 4, 2, PAL.gold);
      px(g, lx + 1, ly - 1, PAL.amber);
    }
    single('decor_bamboo', c);
  }

  // S: Priest's Temple Sacred Bell
  {
    const [c, g] = makeCanvas(32, 38);
    rect(g, 3, 6, 3, 32, PAL.crimson);
    rect(g, 26, 6, 3, 32, PAL.crimson);
    rect(g, 0, 2, 32, 4, PAL.ink);
    rect(g, 2, 6, 28, 2, PAL.gold);
    rect(g, 11, 10, 10, 14, PAL.amber);
    rect(g, 10, 22, 12, 3, PAL.gold);
    rect(g, 13, 12, 6, 10, PAL.moss);
    single('decor_temple_bell', c);
  }

  // D: Trainer's Courtyard Weapon Rack
  {
    const [c, g] = makeCanvas(26, 26);
    rect(g, 3, 6, 2, 20, PAL.wood);
    rect(g, 21, 6, 2, 20, PAL.wood);
    rect(g, 1, 24, 6, 2, PAL.bark);
    rect(g, 19, 24, 6, 2, PAL.bark);
    for (const y of [10, 15, 20]) {
      line(g, 5, y, 22, y - 1, PAL.steel);
      rect(g, 4, y - 1, 3, 2, PAL.red);
    }
    single('decor_weapon_rack', c);
  }

  // K: Cook's Kitchen Boiling Iron Cauldron over Fire Pit
  {
    const frames: HTMLCanvasElement[] = [];
    for (let f = 0; f < 2; f++) {
      const [c, g] = makeCanvas(28, 30);
      rect(g, 2, 24, 24, 6, PAL.stoneDark);
      rect(g, 6, 24, 16, 4, f === 0 ? PAL.red : PAL.orange);
      rect(g, 9, 25, 10, 2, PAL.gold);
      disc(g, 14, 16, 8, PAL.ink);
      rect(g, 5, 9, 18, 3, PAL.inkSoft);
      rect(g, 7, 10, 14, 2, PAL.amber);
      px(g, 9 + f * 3, 9, PAL.white);
      px(g, 16 - f * 2, 9, PAL.white);
      rect(g, 10 + f * 2, 4, 2, 3, PAL.cream);
      rect(g, 15 - f * 2, 2, 2, 3, PAL.cream);
      frames.push(c);
    }
    registerAnim('decor_kitchen_pot', { frames, fps: 5, loop: true, w: 28, h: 30, anchorX: 14, anchorY: 30 });
  }

  // P: Mansion Shoji Screen
  {
    const [c, g] = makeCanvas(24, 34);
    rect(g, 0, 0, 24, 34, PAL.bark);
    rect(g, 2, 2, 20, 28, PAL.cream);
    for (let x = 7; x < 22; x += 5) rect(g, x, 2, 1, 28, PAL.wood);
    for (let y = 9; y < 28; y += 7) rect(g, 2, y, 20, 1, PAL.wood);
    disc(g, 15, 11, 4, PAL.orange);
    disc(g, 12, 14, 3, PAL.red);
    single('decor_shoji', c);
  }

  // V: Windswept Cliffside Maple & Fluttering Clan War Banner Overhanging the Precipice
  {
    const [c, g] = makeCanvas(56, 56);
    // Tall bamboo war-banner pole (Nobori) on the cliff edge
    rect(g, 4, 8, 2, 48, PAL.bamboo);
    rect(g, 4, 8, 12, 2, PAL.bamboo);
    rect(g, 6, 10, 10, 26, PAL.crimson);
    rect(g, 7, 12, 8, 1, PAL.gold);
    disc(g, 11, 21, 3, PAL.gold);
    // Gnarled cliffside momiji maple leaning out over the cloud abyss
    rect(g, 24, 32, 6, 24, PAL.bark);
    line(g, 27, 34, 42, 22, PAL.bark);
    line(g, 42, 22, 52, 24, PAL.bark);
    line(g, 25, 38, 16, 28, PAL.bark);
    disc(g, 36, 18, 11, PAL.crimson);
    disc(g, 46, 21, 9, PAL.red);
    disc(g, 25, 22, 8, PAL.orange);
    disc(g, 39, 13, 7, PAL.gold);
    single('decor_cliff_vista', c, 24, 56);
  }

  // ~: Swamp / Crocodile Hazard
  {
    const frames: HTMLCanvasElement[] = [];
    for (let f = 0; f < 2; f++) {
      const [c, g] = makeCanvas(16, 16);
      rect(g, 0, 5, 16, 11, '#233022');
      rect(g, 0, 5, 16, 2, '#3b522f');
      rect(g, 2, 3 + f, 12, 3, '#2f4528');
      px(g, 4, 2 + f, PAL.gold);
      px(g, 5, 2 + f, PAL.red);
      for (let x = 7; x <= 13; x += 2) px(g, x, 5 + f, PAL.cream);
      rect(g, 12, 4, 3, 1, PAL.red);
      frames.push(c);
    }
    registerAnim('decor_swamp_croc', { frames, fps: 3, loop: true, w: 16, h: 16, anchorX: 8, anchorY: 16 });
  }
}

// ─── Single Isolated Room Level ──────────────────────────────────────────────

export class Level {
  readonly width = CHUNK_W;
  readonly height = CHUNK_H;
  readonly tiles: Uint8Array;
  readonly chunks: ChunkInstance[] = [];
  readonly decor: Decor[] = [];
  readonly swampZones: Rect[] = [];
  readonly waterZones: Rect[] = [];
  readonly hotSprings: HotSpringZone[] = [];
  readonly def: ChunkDef;
  readonly roomIndex: number;
  readonly totalRooms: number;
  exitX = (CHUNK_W - 2) * TILE;
  goalX = 22 * TILE;

  constructor(def: ChunkDef, roomIndex = 0, totalRooms = 12) {
    ensureThemeArt();
    this.def = def;
    this.roomIndex = roomIndex;
    this.totalRooms = totalRooms;
    this.tiles = new Uint8Array(this.width * this.height);
    this.stampRoom(def, roomIndex, roomIndex === totalRooms - 1);
  }

  get theme(): RoomTheme {
    return this.def.theme;
  }
  get pxWidth(): number {
    return this.width * TILE;
  }
  get pxHeight(): number {
    return this.height * TILE;
  }

  private stampRoom(def: ChunkDef, index: number, isFinal: boolean): void {
    const inst: ChunkInstance = {
      index,
      def,
      x0: 0,
      enemyAnchors: [],
      chestAnchors: [],
      bossAnchor: null,
      activated: false,
      budget: 0,
      isFinal,
    };

    let springMinX = Infinity;
    let springMaxX = -Infinity;
    let springRow = 10;

    for (let r = 0; r < CHUNK_H; r++) {
      const raw = def.rows[r] ?? '';
      const row = raw.padEnd(CHUNK_W, '.').slice(0, CHUNK_W);

      for (let c = 0; c < CHUNK_W; c++) {
        const wx = c * TILE + TILE / 2;
        const wy = (r + 1) * TILE;
        const ch = row[c];

        switch (ch) {
          case '#':
            this.set(c, r, T.Solid);
            break;
          case '=':
            this.set(c, r, T.Platform);
            break;
          case '^':
            this.set(c, r, T.Spike);
            break;
          case '~':
            this.set(c, r, T.Spike);
            this.decor.push({ kind: 'swamp_croc', x: wx, y: wy });
            this.swampZones.push({ x: c * TILE, y: r * TILE, w: TILE, h: TILE });
            break;
          case 'H':
            // Sunken Hot Spring basin carved directly into row 10 (left T.Empty so player steps down into the water!)
            this.set(c, r, T.Empty);
            springMinX = Math.min(springMinX, c * TILE);
            springMaxX = Math.max(springMaxX, (c + 1) * TILE);
            springRow = r;
            break;
          case 'W':
            // Sunken Waterfall Lagoon carved into row 10 (player wades through deep moving water)
            this.set(c, r, T.Empty);
            this.waterZones.push({ x: c * TILE, y: (r - 1) * TILE, w: TILE, h: TILE * 2 });
            break;
          case 'E':
            inst.enemyAnchors.push({ x: wx, y: wy });
            break;
          case 'C':
            inst.chestAnchors.push({ x: wx, y: wy });
            break;
          case 'M':
            if (def.bossKind) inst.bossAnchor = { x: wx, y: wy, kind: def.bossKind };
            break;
          case 'X':
            this.decor.push({ kind: 'exit_arch', x: wx, y: wy });
            this.exitX = wx;
            break;
          case 'T':
            this.decor.push({ kind: 'torii', x: wx, y: wy });
            break;
          case 'L':
            this.decor.push({ kind: 'lantern', x: wx, y: wy });
            break;
          case 'F':
            this.decor.push({ kind: 'maple', x: wx, y: wy });
            break;
          case 'B':
            this.decor.push({ kind: 'bamboo', x: wx, y: wy });
            break;
          case 'S':
            this.decor.push({ kind: 'temple_bell', x: wx, y: wy });
            break;
          case 'D':
            this.decor.push({ kind: 'weapon_rack', x: wx, y: wy });
            break;
          case 'K':
            this.decor.push({ kind: 'kitchen_pot', x: wx, y: wy });
            break;
          case 'P':
            this.decor.push({ kind: 'shoji', x: wx, y: wy });
            break;
          case 'V':
            this.decor.push({ kind: 'cliff_vista', x: wx, y: wy });
            this.goalX = wx;
            break;
          case 'G':
            this.decor.push({ kind: 'gate', x: wx, y: wy });
            this.goalX = wx;
            break;
        }
      }
    }

    // Guarantee that EVERY Bamboo Grove room has a sunken Hot Spring bath in cols 9..18 even if H was omitted
    if (def.theme === 'bamboo' && !(springMaxX > springMinX)) {
      springRow = 10;
      springMinX = 9 * TILE;
      springMaxX = 19 * TILE;
      for (let c = 9; c < 19; c++) {
        this.set(c, 10, T.Empty);
        this.set(c, 11, T.Solid);
      }
    }

    if (springMaxX > springMinX) {
      this.hotSprings.push({
        rect: {
          x: springMinX - 4,
          y: (springRow - 1) * TILE,
          w: springMaxX - springMinX + 8,
          h: TILE * 2 + 4,
        },
        dwellTime: 0,
        buffGranted: false,
      });
    }

    // Platform Reachability Guarantee: ensure every elevated slab (row <= 8) has a standable stepping stone within 2 rows below
    for (let r = 3; r <= 8; r++) {
      for (let c = 1; c < CHUNK_W - 1; c++) {
        if (this.tileAt(c, r) !== T.Platform) continue;
        // Only check at the start of a contiguous platform slab
        if (this.tileAt(c - 1, r) === T.Platform) continue;
        let endC = c;
        while (endC + 1 < CHUNK_W && this.tileAt(endC + 1, r) === T.Platform) endC++;

        let reachable = false;
        for (let dr = 1; dr <= 2; dr++) {
          const checkR = r + dr;
          if (checkR >= CHUNK_H) break;
          for (let sc = Math.max(1, c - 2); sc <= Math.min(CHUNK_W - 2, endC + 2); sc++) {
            const t = this.tileAt(sc, checkR);
            if (t === T.Solid || t === T.Platform) {
              reachable = true;
              break;
            }
          }
          if (reachable) break;
        }

        if (!reachable && r + 2 <= 9) {
          const mid = Math.floor((c + endC) / 2);
          for (let sc = Math.max(2, mid - 2); sc <= Math.min(CHUNK_W - 3, mid + 2); sc++) {
            if (this.tileAt(sc, r + 2) === T.Empty) {
              this.set(sc, r + 2, T.Platform);
            }
          }
        }
        c = endC;
      }
    }

    this.chunks.push(inst);
  }

  private set(tx: number, ty: number, t: number): void {
    if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) return;
    this.tiles[ty * this.width + tx] = t;
  }

  tileAt(tx: number, ty: number): number {
    if (tx < 0 || tx >= this.width) return T.Solid;
    if (ty < 0 || ty >= this.height) return T.Empty;
    return this.tiles[ty * this.width + tx];
  }

  isSolidTile(tx: number, ty: number): boolean {
    const t = this.tileAt(tx, ty);
    return t === T.Solid || t === T.Spike;
  }

  solidAtPx(x: number, y: number): boolean {
    return this.isSolidTile(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  standableAtPx(x: number, y: number): boolean {
    return this.tileAt(Math.floor(x / TILE), Math.floor(y / TILE)) !== T.Empty;
  }

  chunkAtPx(_x: number): ChunkInstance {
    return this.chunks[0];
  }

  isInWater(box: Rect): boolean {
    return this.waterZones.some((w) => overlap(box, w));
  }

  updateHotSpring(playerBox: Rect, dt: number): { triggered: boolean; progress: number } {
    let maxProg = 0;
    for (const hs of this.hotSprings) {
      if (hs.buffGranted) continue;
      if (overlap(playerBox, hs.rect)) {
        hs.dwellTime += dt;
        maxProg = Math.max(maxProg, Math.min(1, hs.dwellTime / 7.0));
        if (hs.dwellTime >= 7.0) {
          hs.buffGranted = true;
          return { triggered: true, progress: 1 };
        }
      } else {
        hs.dwellTime = Math.max(0, hs.dwellTime - dt * 0.4);
        maxProg = Math.max(maxProg, hs.dwellTime / 7.0);
      }
    }
    return { triggered: false, progress: maxProg };
  }
}

// ─── Sunken Onsen Hot Spring & Organic Cascading Waterfall Renderer ──────────

export function drawRoomWaterAndSprings(
  ctx: CanvasRenderingContext2D,
  level: Level,
  camX: number,
  camY: number,
  time: number,
): void {
  // 1. BAMBOO GROVE SUNKEN ONSEN HOT SPRING
  for (const hs of level.hotSprings) {
    const sx = Math.round(hs.rect.x + 4 - camX);
    const w = Math.round(hs.rect.w - 8);
    const rimY = 10 * TILE - camY; // top of row 10 (ground level = 160)
    const floorY = 11 * TILE - camY; // bottom of sunken pool (176)

    // Dark stone lining at back of sunken bath
    ctx.fillStyle = '#1d2420';
    ctx.fillRect(sx, rimY, w, TILE);

    // Deep glowing mineral-turquoise hot spring water filling the sunken row-10 basin
    ctx.fillStyle = 'rgba(28, 128, 148, 0.85)';
    ctx.fillRect(sx, rimY + 2, w, TILE - 2);
    ctx.fillStyle = 'rgba(72, 198, 212, 0.78)';
    ctx.fillRect(sx, rimY + 2, w, 6);

    // Animated sine-wave surface ripples along the water top
    for (let x = 2; x < w - 4; x += 2) {
      const wave = Math.sin(x * 0.15 + time * 6) * 1.2;
      ctx.fillStyle = PAL.spirit;
      ctx.fillRect(sx + x, Math.round(rimY + 1 + wave), 2, 2);
    }

    // Rising boiling mineral bubbles inside the sunken pool
    for (let x = 10; x < w - 10; x += 14) {
      const bubY = floorY - 2 - ((time * 20 + x * 5) % 13);
      ctx.fillStyle = PAL.white;
      ctx.fillRect(sx + x, Math.round(bubY), 2, 2);
    }

    // Floating red & gold autumn maple leaves on the water surface
    for (let x = 16; x < w - 16; x += 26) {
      const drift = Math.sin(time * 2.2 + x) * 5;
      ctx.fillStyle = x % 52 === 16 ? PAL.red : PAL.gold;
      ctx.fillRect(Math.round(sx + x + drift), rimY + 1, 4, 2);
    }

    // Stacked Volcanic Onsen Boulders framing Left & Right walls of the pool
    const drawRockWall = (rx: number) => {
      ctx.fillStyle = PAL.stoneDark;
      ctx.fillRect(rx - 7, rimY - 8, 14, 24);
      ctx.fillStyle = PAL.stone;
      ctx.fillRect(rx - 5, rimY - 10, 10, 10);
      ctx.fillRect(rx - 6, rimY + 1, 11, 10);
      ctx.fillStyle = '#b5aea2';
      ctx.fillRect(rx - 4, rimY - 10, 7, 2);
    };
    drawRockWall(sx);
    drawRockWall(sx + w);

    // Traditional wooden Onsen Lantern Signpost & Hinoki Bath Bucket on the rim
    ctx.fillStyle = PAL.bark;
    ctx.fillRect(sx - 12, rimY - 26, 2, 20);
    ctx.fillStyle = PAL.red;
    ctx.fillRect(sx - 16, rimY - 24, 10, 11);
    ctx.fillStyle = PAL.cream;
    ctx.fillRect(sx - 15, rimY - 22, 8, 7);
    ctx.fillStyle = PAL.red;
    ctx.fillRect(sx - 13, rimY - 20, 4, 3);

    // Hinoki wooden bucket + folded towel on the right boulder
    ctx.fillStyle = PAL.woodLight;
    ctx.fillRect(sx + w - 3, rimY - 15, 7, 5);
    ctx.fillStyle = PAL.bark;
    ctx.fillRect(sx + w - 3, rimY - 13, 7, 1);
    ctx.fillStyle = PAL.white;
    ctx.fillRect(sx + w + 5, rimY - 12, 6, 2);

    // Billowing crimson-tinted & white steam plumes rising out of the sunken bath
    for (let i = 0; i < 18; i++) {
      const baseX = sx + 8 + ((i * 17) % Math.max(12, w - 16));
      const cycle = (time * 24 + i * 6) % 42;
      const wx = baseX + Math.sin(time * 3.2 + i) * 5;
      const wy = rimY - cycle;
      const alpha = Math.max(0, 1 - cycle / 42) * 0.78;
      ctx.fillStyle =
        i % 3 === 0
          ? `rgba(232, 116, 44, ${alpha.toFixed(2)})`
          : `rgba(255, 246, 232, ${alpha.toFixed(2)})`;
      const sz = cycle > 20 ? 3 : 2;
      ctx.fillRect(Math.round(wx), Math.round(wy), sz, sz);
    }

    // Progress bar when player is bathing in the spring
    if (hs.dwellTime > 0.05 && !hs.buffGranted) {
      const p = Math.min(1, hs.dwellTime / 7.0);
      const bw = 64;
      const bx = Math.round(sx + w / 2 - bw / 2);
      const by = rimY - 36;
      ctx.fillStyle = PAL.ink;
      ctx.fillRect(bx - 1, by - 1, bw + 2, 6);
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(bx, by, Math.round(bw * p), 4);
    }
  }

  // 2. WATERFALL CAVE: Organic Cascading Waterfalls & Sunken Flowing River Lagoon
  if (level.waterZones.length > 0) {
    let i = 0;
    while (i < level.waterZones.length) {
      const start = level.waterZones[i];
      let end = start;
      while (
        i + 1 < level.waterZones.length &&
        Math.abs(level.waterZones[i + 1].x - (end.x + end.w)) <= 2
      ) {
        end = level.waterZones[++i];
      }
      i++;

      const sx = Math.round(start.x - camX);
      const rimY = 10 * TILE - camY; // screen-Y of top of sunken lagoon
      const floorY = 11 * TILE - camY; // screen-Y of riverbed
      const topY = Math.max(0, 10 - camY); // screen-Y of upper cavern mouth
      const bw = Math.round(end.x + end.w - start.x);

      // Dark submerged rock wall behind the sunken lagoon
      ctx.fillStyle = '#0e1824';
      ctx.fillRect(sx, rimY, bw, TILE);

      // Cascading waterfalls pouring from mossy cliff mouths directly into the sunken pond!
      const fallCount = bw >= 160 ? 2 : 1;
      for (let f = 0; f < fallCount; f++) {
        const center = Math.round(sx + (bw * (f + 1)) / (fallCount + 1));
        const baseW = 30;

        // Stepped mossy rock overhang at the top of the waterfall
        ctx.fillStyle = '#121b26';
        ctx.fillRect(center - 20, 0, 40, topY + 6);
        ctx.fillStyle = '#243445';
        ctx.fillRect(center - 16, Math.max(0, topY + 2), 32, 6);
        ctx.fillStyle = PAL.amber;
        ctx.fillRect(center - 15, Math.max(0, topY + 1), 8, 2);
        ctx.fillRect(center + 8, Math.max(0, topY + 1), 7, 2);

        // Draw organic scanline waterfall curtain all the way into the underlying pond (topY .. rimY + 8)
        const fallBottom = rimY + 8;
        const fallHeight = Math.max(24, fallBottom - topY);
        for (let y = topY + 4; y <= fallBottom; y += 2) {
          const prog = (y - topY) / fallHeight;
          const sway = Math.sin(y * 0.09 - time * 14 + f * 2) * 2;
          const halfW = Math.round(baseW * 0.5 + prog * 4 + Math.cos(y * 0.15 - time * 10) * 1.2);
          const left = Math.round(center - halfW + sway);
          const width = halfW * 2;

          // Deep water core
          ctx.fillStyle = 'rgba(28, 108, 158, 0.68)';
          ctx.fillRect(left, y, width, 2);
          // Bright inner current
          ctx.fillStyle = 'rgba(78, 188, 232, 0.62)';
          ctx.fillRect(left + 3, y, width - 6, 2);
          // White aerated edge foam on both sides of the cascade
          ctx.fillStyle = 'rgba(235, 250, 255, 0.82)';
          ctx.fillRect(left, y, 2, 2);
          ctx.fillRect(left + width - 2, y, 2, 2);
        }

        // Fast-falling pixel water crests & droplets scrolling all the way down into the pond surface
        for (let s = 0; s < 24; s++) {
          const lane = ((s * 7) % (baseW - 6)) - (baseW / 2 - 3);
          const spd = 145 + (s % 3) * 38;
          const wy = ((time * spd + s * 23) % (fallHeight - 6)) + topY + 4;
          const wx = center + lane + Math.sin(wy * 0.1 - time * 8) * 1.5;
          ctx.fillStyle = s % 2 === 0 ? PAL.white : PAL.spirit;
          ctx.fillRect(Math.round(wx), Math.round(wy), 2, 7 + (s % 3) * 3);
        }

        // Dynamic splash mist & leaping water droplets right where the cascade meets the pond surface
        for (let k = -4; k <= 4; k++) {
          const phase = time * 11 + k * 1.3 + f;
          const lift = Math.abs(Math.sin(phase)) * 9;
          const spread = k * 4.2 + Math.cos(phase) * 2;
          ctx.fillStyle = Math.abs(k) <= 2 ? PAL.white : 'rgba(180, 240, 255, 0.88)';
          ctx.fillRect(Math.round(center + spread - 2), Math.round(rimY + 1 - lift), 4, 4);
        }
      }

      // Deep flowing lagoon water filling the sunken row-10 basin
      ctx.fillStyle = 'rgba(20, 86, 134, 0.85)';
      ctx.fillRect(sx, rimY + 2, bw, floorY - rimY - 2);
      ctx.fillStyle = 'rgba(56, 152, 204, 0.68)';
      ctx.fillRect(sx, rimY + 2, bw, 6);

      // Animated horizontal surface waves & scrolling current streaks
      for (let x = 0; x < bw; x += 2) {
        const wave = Math.sin(x * 0.16 - time * 10) * 1.5;
        ctx.fillStyle = x % 6 === 0 ? PAL.white : PAL.spirit;
        ctx.fillRect(sx + x, Math.round(rimY + 1 + wave), 2, 2);
      }

      // Submerged current ribbons & floating autumn maple leaves moving with the current
      const flow = (time * 60) % 24;
      for (let x = flow; x < bw - 8; x += 24) {
        ctx.fillStyle = 'rgba(200, 245, 255, 0.75)';
        ctx.fillRect(Math.round(sx + x), rimY + 7, 8, 1);
        ctx.fillRect(Math.round(sx + ((x + 11) % (bw - 8))), rimY + 11, 6, 1);
        ctx.fillStyle = PAL.red;
        ctx.fillRect(Math.round(sx + ((x + 6) % (bw - 6))), rimY + 1, 3, 2);
      }
    }
  }
}

// ─── Custom Per-Room Thematic Background & Architecture Painter ──────────────

export function drawRoomBackground(
  ctx: CanvasRenderingContext2D,
  theme: RoomTheme,
  camX: number,
  leaves: { x: number; y: number; size: number; color: string }[],
  time = 0,
): void {
  const drawBands = (cols: string[]) => {
    const bh = Math.ceil(VIEW_H / cols.length);
    cols.forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.fillRect(0, i * bh, VIEW_W, bh + 1);
    });
  };

  switch (theme) {
    case 'estate': {
      drawBands(['#1a1024', '#2e1630', '#541e32', '#822c2e', '#b54b2c', '#d97c36']);
      ctx.fillStyle = PAL.gold;
      ctx.beginPath();
      ctx.arc(240, 52, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#180e1e';
      ctx.fillRect(0, 118, VIEW_W, 46);
      ctx.fillStyle = '#26172e';
      ctx.fillRect(0, 116, VIEW_W, 3);
      break;
    }

    case 'forest': {
      // Rich Scenic Autumn Woodland: Stationary distant mountains + stable integer-indexed cedar/maple trees
      drawBands(['#120e17', '#241720', '#422224', '#6e3226', '#9e4c28', '#c97834']);

      // Distant misty mountain ridge (stationary at horizon distance)
      ctx.fillStyle = '#381c22';
      for (let x = -40; x < VIEW_W + 60; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, 160);
        ctx.lineTo(x + 30, 78);
        ctx.lineTo(x + 60, 160);
        ctx.fill();
      }

      // Far parallax layer: Dense ancient cedar (sugi) spire silhouettes using stable tree index i
      const shift1 = Math.round(camX * 0.08);
      ctx.fillStyle = '#29151a';
      for (let i = -2; i <= 14; i++) {
        const x = i * 28 - shift1;
        const h = 46 + (((i * 7) & 15) + 16) % 16;
        ctx.fillRect(x + 11, h, 4, 160 - h);
        ctx.beginPath();
        ctx.moveTo(x + 2, h + 38);
        ctx.lineTo(x + 13, h - 8);
        ctx.lineTo(x + 24, h + 38);
        ctx.fill();
      }

      // Diagonal golden-amber sunbeams slanting through the forest canopy
      const shiftBeam = Math.round(camX * 0.12);
      ctx.fillStyle = 'rgba(247, 210, 106, 0.09)';
      for (let i = -1; i <= 6; i++) {
        const sx = i * 72 - shiftBeam;
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx + 22, 0);
        ctx.lineTo(sx + 68, 160);
        ctx.lineTo(sx + 40, 160);
        ctx.fill();
      }

      // Mid-ground layer: Gnarled Japanese maple & oak trees with lush multi-tone autumn crowns
      const shift2 = Math.round(camX * 0.18);
      for (let i = -1; i <= 7; i++) {
        const bx = i * 64 - shift2;
        // Trunk & spreading branches
        ctx.fillStyle = '#261512';
        ctx.fillRect(bx + 26, 34, 8, 126);
        ctx.fillRect(bx + 16, 48, 12, 4);
        ctx.fillRect(bx + 32, 42, 14, 4);
        // Layered crimson, scarlet, orange & gold foliage canopy across the upper screen
        ctx.fillStyle = '#59161e';
        ctx.fillRect(bx - 4, 0, 68, 26);
        ctx.fillStyle = PAL.crimson;
        ctx.fillRect(bx + 4, 18, 52, 22);
        ctx.fillStyle = PAL.red;
        ctx.fillRect(bx + 10, 26, 28, 16);
        ctx.fillStyle = PAL.orange;
        ctx.fillRect(bx + 28, 22, 24, 16);
        ctx.fillStyle = PAL.gold;
        ctx.fillRect(bx + 16, 14, 18, 8);

        // Woodland floor undergrowth: mossy boulders, ferns & red spider lilies (higanbana)
        ctx.fillStyle = '#1f291a';
        ctx.fillRect(bx + 6, 148, 18, 12);
        ctx.fillStyle = PAL.moss;
        ctx.fillRect(bx + 8, 146, 14, 3);
        ctx.fillStyle = PAL.red;
        ctx.fillRect(bx + 46, 151, 3, 3);
        ctx.fillRect(bx + 51, 152, 3, 3);
        ctx.fillStyle = '#2d4222';
        ctx.fillRect(bx + 47, 154, 1, 6);
        ctx.fillRect(bx + 52, 155, 1, 5);
      }
      break;
    }

    case 'bamboo': {
      drawBands(['#12211e', '#1c332b', '#2b4a37', '#466942', '#6e8c4a', '#9eb058']);
      const bx1 = -Math.round((camX * 0.12) % 24);
      ctx.fillStyle = '#1e3629';
      for (let x = bx1 - 24; x < VIEW_W + 24; x += 24) {
        ctx.fillRect(x + 8, 0, 3, VIEW_H);
      }
      const bx2 = -Math.round((camX * 0.22) % 32);
      for (let x = bx2 - 32; x < VIEW_W + 32; x += 32) {
        ctx.fillStyle = '#3c5e38';
        ctx.fillRect(x + 12, 0, 4, VIEW_H);
        for (let y = 14; y < VIEW_H; y += 22) {
          ctx.fillStyle = '#253d26';
          ctx.fillRect(x + 11, y, 6, 1);
          ctx.fillStyle = PAL.gold;
          ctx.fillRect(x + 16, y + 3, 6, 2);
        }
      }
      break;
    }

    case 'cave': {
      // Subterranean Grotto Rock Columns & Stalactites (actual waterfalls are drawn directly into ponds!)
      drawBands(['#0b1017', '#111a26', '#172433', '#1d3042', '#233b50', '#28455c']);
      const shiftCave = Math.round(camX * 0.14);
      for (let i = -1; i <= 8; i++) {
        const x = i * 48 - shiftCave;
        // Deep cavern basalt pillars in background
        ctx.fillStyle = '#0e1722';
        ctx.fillRect(x + 16, 0, 14, VIEW_H);
        ctx.fillStyle = '#152230';
        ctx.fillRect(x + 19, 0, 6, VIEW_H);
        // Hanging ceiling rock & stalactites with autumn moss
        ctx.fillStyle = '#0d141c';
        ctx.fillRect(x, 0, 48, 12);
        ctx.fillRect(x + 6, 12, 12, 10);
        ctx.fillRect(x + 28, 12, 10, 16);
        ctx.fillStyle = PAL.amber;
        ctx.fillRect(x + 9, 10, 4, 2);
        ctx.fillRect(x + 31, 13, 3, 2);
      }
      break;
    }

    case 'temple': {
      drawBands(['#241426', '#421d30', '#6e2b2e', '#9e472b', '#cc7430', '#f0ae46']);
      const tx = -((camX * 0.2) % 64);
      for (let x = tx - 64; x < VIEW_W + 64; x += 64) {
        ctx.fillStyle = '#5e161c';
        ctx.fillRect(x + 26, 28, 6, 136);
        ctx.fillStyle = '#1c111c';
        ctx.fillRect(x, 22, 64, 8);
        ctx.fillStyle = PAL.gold;
        ctx.fillRect(x + 25, 34, 8, 3);
      }
      break;
    }

    case 'courtyard': {
      // Trainer's Dojo Courtyard: Vivid autumn sunset sky with silhouettes of traditional
      // Japanese castle keeps (Tenshu), multi-tier pagodas, and curved-roof dojo halls!
      drawBands(['#1a1026', '#331832', '#5c2438', '#8f3b36', '#c46234', '#eb9c48']);

      // Setting autumn sun behind the castle silhouettes
      ctx.fillStyle = PAL.gold;
      ctx.beginPath();
      ctx.arc(160 - camX * 0.04, 62, 26, 0, Math.PI * 2);
      ctx.fill();

      const shift = Math.round(camX * 0.12);

      // Helper to draw a traditional curved Japanese tiled roof tier with upturned eaves
      const drawRoofTier = (cx: number, y: number, w: number, h: number) => {
        ctx.fillStyle = '#180d1c';
        ctx.beginPath();
        ctx.moveTo(cx - w / 2 - 5, y + h);
        ctx.lineTo(cx - w / 2 + 4, y);
        ctx.lineTo(cx + w / 2 - 4, y);
        ctx.lineTo(cx + w / 2 + 5, y + h);
        ctx.fill();
        // Upturned roof eave tips
        ctx.fillRect(cx - w / 2 - 7, y + h - 2, 3, 2);
        ctx.fillRect(cx + w / 2 + 4, y + h - 2, 3, 2);
      };

      // 1. Left Silhouette: 3-Tier Japanese Pagoda Tower + Autumn Maple Canopy
      const pagX = 58 - shift;
      ctx.fillStyle = '#180d1c';
      ctx.fillRect(pagX - 1, 26, 2, 12); // spire finial
      drawRoofTier(pagX, 36, 26, 6);
      ctx.fillRect(pagX - 9, 42, 18, 12);
      drawRoofTier(pagX, 52, 32, 6);
      ctx.fillRect(pagX - 11, 58, 22, 14);
      drawRoofTier(pagX, 70, 38, 7);
      ctx.fillRect(pagX - 13, 77, 26, 35);
      // Glowing paper window in pagoda
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(pagX - 3, 62, 6, 5);

      // 2. Center Silhouette: Grand Feudal Castle Keep (Tenshu) with Shachihoko roof ornaments
      const keepX = 165 - shift;
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(keepX - 14, 25, 2, 3); // left golden shachihoko ornament
      ctx.fillRect(keepX + 12, 25, 2, 3); // right golden shachihoko ornament
      drawRoofTier(keepX, 27, 36, 7);
      ctx.fillStyle = '#180d1c';
      ctx.fillRect(keepX - 14, 34, 28, 14);
      drawRoofTier(keepX, 46, 48, 8);
      ctx.fillRect(keepX - 20, 54, 40, 18);
      drawRoofTier(keepX, 70, 62, 9);
      ctx.fillRect(keepX - 26, 79, 52, 35);
      // Warm candlelit lattice windows inside the Castle Keep
      ctx.fillStyle = PAL.amber;
      for (const wx of [-8, 2]) ctx.fillRect(keepX + wx, 38, 5, 5);
      for (const wx of [-12, -2, 8]) ctx.fillRect(keepX + wx, 58, 5, 6);

      // 3. Right Silhouette: Traditional Dojo Training Hall (Butokuden)
      const dojoX = 268 - shift;
      drawRoofTier(dojoX, 60, 58, 10);
      ctx.fillStyle = '#180d1c';
      ctx.fillRect(dojoX - 24, 70, 48, 42);
      ctx.fillStyle = PAL.orange;
      for (let wx = -16; wx <= 12; wx += 10) {
        ctx.fillRect(dojoX + wx, 78, 6, 8);
      }

      // Silhouetted autumn maple & ginkgo canopies peeking over the courtyard wall
      for (const [tx, col] of [
        [24 - shift, PAL.crimson],
        [106 - shift, PAL.red],
        [218 - shift, PAL.orange],
        [308 - shift, PAL.crimson],
      ] as const) {
        ctx.fillStyle = col;
        ctx.fillRect(tx - 14, 92, 28, 14);
        ctx.fillRect(tx - 9, 86, 18, 8);
      }

      // Traditional white Namako plaster courtyard perimeter wall with dark tiled coping
      ctx.fillStyle = '#180d1c';
      ctx.fillRect(0, 102, VIEW_W, 5);
      ctx.fillStyle = '#d9ccb8';
      ctx.fillRect(0, 107, VIEW_W, 38);
      ctx.fillStyle = '#291a18';
      ctx.fillRect(0, 145, VIEW_W, 16);
      const wx = -((camX * 0.25) % 32);
      for (let x = wx - 32; x < VIEW_W + 32; x += 32) {
        ctx.fillRect(x, 106, 3, 40);
      }
      break;
    }

    case 'kitchen': {
      drawBands(['#140b09', '#1f110e', '#2b1712', '#381e17', '#45241b', '#522b20']);
      ctx.fillStyle = 'rgba(232, 116, 44, 0.14)';
      ctx.fillRect(0, 96, VIEW_W, 64);

      ctx.fillStyle = '#120907';
      ctx.fillRect(0, 0, VIEW_W, 16);
      ctx.fillStyle = '#24130e';
      ctx.fillRect(0, 16, VIEW_W, 3);

      const kx = -((camX * 0.22) % 96);
      for (let x = kx - 96; x < VIEW_W + 96; x += 96) {
        const bx = Math.round(x);
        ctx.fillStyle = '#1a0d0a';
        ctx.fillRect(bx, 16, 7, 144);

        // 1. Stone & brick Kamado Hearth
        ctx.fillStyle = '#2e2522';
        ctx.fillRect(bx + 12, 68, 30, 92);
        ctx.fillStyle = '#42332d';
        ctx.fillRect(bx + 8, 106, 38, 54);
        ctx.fillStyle = '#1c1210';
        ctx.fillRect(bx + 14, 124, 26, 36);
        const flick = Math.floor(time * 8) % 2;
        ctx.fillStyle = PAL.crimson;
        ctx.fillRect(bx + 16, 134, 22, 24);
        ctx.fillStyle = PAL.orange;
        ctx.fillRect(bx + 18, 136 + flick * 2, 18, 20 - flick * 2);
        ctx.fillStyle = PAL.gold;
        ctx.fillRect(bx + 21, 142 - flick, 12, 14);
        ctx.fillStyle = PAL.white;
        ctx.fillRect(bx + 24, 148, 6, 6);

        // 2. Hanging Animal Carcasses & Meat Hooks
        ctx.fillStyle = PAL.steelDark;
        ctx.fillRect(bx + 56, 18, 1, 14);
        ctx.fillRect(bx + 55, 31, 3, 2);
        ctx.fillStyle = '#7a2328';
        ctx.fillRect(bx + 51, 33, 11, 26);
        ctx.fillStyle = '#a8383b';
        ctx.fillRect(bx + 52, 35, 9, 22);
        ctx.fillStyle = PAL.cream;
        for (let ry = 38; ry <= 50; ry += 4) {
          ctx.fillRect(bx + 53, ry, 7, 1);
        }
        ctx.fillStyle = '#521518';
        ctx.fillRect(bx + 55, 33, 2, 24);

        ctx.fillStyle = PAL.steelDark;
        ctx.fillRect(bx + 76, 18, 1, 10);
        ctx.fillStyle = '#cfa07a';
        ctx.fillRect(bx + 73, 28, 7, 13);
        ctx.fillStyle = '#9e6b4a';
        ctx.fillRect(bx + 72, 31, 2, 7);
        ctx.fillRect(bx + 80, 31, 2, 7);
        ctx.fillStyle = PAL.red;
        ctx.fillRect(bx + 75, 41, 3, 3);

        // 3. Butcher Chopping Block Table with cleaver & meat
        ctx.fillStyle = '#3b2114';
        ctx.fillRect(bx + 52, 140, 6, 20);
        ctx.fillRect(bx + 82, 140, 6, 20);
        ctx.fillStyle = '#8c5836';
        ctx.fillRect(bx + 48, 132, 44, 9);
        ctx.fillStyle = '#b5794c';
        ctx.fillRect(bx + 48, 132, 44, 2);
        ctx.fillStyle = PAL.blood;
        ctx.fillRect(bx + 58, 134, 12, 3);
        ctx.fillStyle = '#b83236';
        ctx.fillRect(bx + 54, 128, 12, 4);
        ctx.fillStyle = PAL.cream;
        ctx.fillRect(bx + 56, 129, 4, 2);
        ctx.fillStyle = PAL.steel;
        ctx.fillRect(bx + 70, 123, 8, 9);
        ctx.fillStyle = PAL.white;
        ctx.fillRect(bx + 70, 123, 8, 1);
        ctx.fillStyle = PAL.bark;
        ctx.fillRect(bx + 78, 121, 5, 3);
        ctx.fillStyle = PAL.orange;
        ctx.fillRect(bx + 83, 127, 6, 5);
        ctx.fillStyle = PAL.moss;
        ctx.fillRect(bx + 85, 125, 2, 2);
      }
      break;
    }

    case 'mansion': {
      drawBands(['#1c1014', '#29161b', '#381e22', '#472528', '#542c2c', '#613330']);
      const mx = -((camX * 0.22) % 48);
      for (let x = mx - 48; x < VIEW_W + 48; x += 48) {
        ctx.fillStyle = '#1a0e10';
        ctx.fillRect(x, 0, 48, 18);
        ctx.fillStyle = '#3b2019';
        ctx.fillRect(x + 4, 68, 38, 86);
        ctx.fillStyle = '#d9c39e';
        ctx.fillRect(x + 7, 72, 32, 76);
        ctx.fillStyle = '#b57c52';
        ctx.fillRect(x + 14, 88, 14, 8);
        ctx.fillRect(x + 20, 82, 10, 8);
        ctx.fillStyle = '#4a281d';
        ctx.fillRect(x + 22, 72, 2, 76);
        ctx.fillRect(x + 7, 108, 32, 2);
      }
      break;
    }

    case 'cliff': {
      // High Scenic Mountain Precipice: Starlit indigo-crimson sky, Giant Harvest Moon,
      // Mt. Fuji silhouette on the horizon, and layered autumn clouds drifting HIGH in the sky!
      drawBands(['#090714', '#130e26', '#23163b', '#3d1f4c', '#682b4a', '#9c3f3e', '#cf683e']);

      // Twinkling stars in upper sky
      ctx.fillStyle = PAL.cream;
      for (let i = 0; i < 28; i++) {
        const sx = Math.floor(hash2(i, 1, 77) * VIEW_W);
        const sy = Math.floor(hash2(i, 2, 77) * 58);
        if ((i + Math.floor(time * 2)) % 5 !== 0) ctx.fillRect(sx, sy, 1, 1);
      }

      // Giant Luminous Harvest Moon high in the sky (stationary at infinite distance)
      const moonX = 232;
      const moonY = 44;
      ctx.fillStyle = 'rgba(247, 210, 106, 0.18)';
      ctx.beginPath();
      ctx.arc(moonX, moonY, 46, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.gold;
      ctx.beginPath();
      ctx.arc(moonX, moonY, 33, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.cream;
      ctx.beginPath();
      ctx.arc(moonX - 2, moonY - 2, 28, 0, Math.PI * 2);
      ctx.fill();

      // Flock of cranes flying across the moon
      for (let b = 0; b < 4; b++) {
        const bx = Math.round(moonX - 22 + b * 11 - ((time * 9) % 40));
        const by = Math.round(moonY - 8 + b * 4 + Math.sin(time * 6 + b) * 1.5);
        ctx.fillStyle = '#1e1430';
        ctx.fillRect(bx - 2, by, 2, 1);
        ctx.fillRect(bx + 1, by, 2, 1);
        ctx.fillRect(bx, by + 1, 1, 1);
      }

      // HIGH-SKY CLOUD LAYER 1 (Drifting across the upper sky & moon at y = 26..48)
      const highCloud = (time * 6) % 90;
      for (let x = -highCloud - 90; x < VIEW_W + 90; x += 90) {
        const cx = Math.round(x);
        ctx.fillStyle = 'rgba(110, 48, 78, 0.65)';
        ctx.fillRect(cx + 10, 30, 46, 7);
        ctx.fillStyle = 'rgba(232, 130, 74, 0.72)';
        ctx.fillRect(cx + 16, 28, 34, 3);
        ctx.fillStyle = 'rgba(247, 210, 106, 0.65)';
        ctx.fillRect(cx + 22, 27, 20, 1);
      }

      // Distant sacred volcano silhouette (Mt. Fuji style, stationary at horizon distance)
      const fujiX = 135;
      ctx.fillStyle = '#1e1330';
      ctx.beginPath();
      ctx.moveTo(fujiX - 85, 145);
      ctx.lineTo(fujiX - 12, 74);
      ctx.lineTo(fujiX + 12, 74);
      ctx.lineTo(fujiX + 85, 145);
      ctx.fill();
      // Sunset-tinted snow cap on the peak
      ctx.fillStyle = '#e8b796';
      ctx.beginPath();
      ctx.moveTo(fujiX - 12, 74);
      ctx.lineTo(fujiX + 12, 74);
      ctx.lineTo(fujiX + 24, 88);
      ctx.lineTo(fujiX - 24, 88);
      ctx.fill();

      // MID-SKY CLOUD LAYER 2 (Billowing golden-crimson cloud banks at y = 62..96)
      const midCloud = (time * 10 + camX * 0.1) % 68;
      for (let x = -midCloud - 68; x < VIEW_W + 68; x += 68) {
        const cx = Math.round(x);
        ctx.fillStyle = 'rgba(84, 32, 58, 0.82)';
        ctx.fillRect(cx, 72, 52, 12);
        ctx.fillStyle = 'rgba(184, 68, 62, 0.85)';
        ctx.fillRect(cx + 6, 67, 40, 7);
        ctx.fillStyle = PAL.gold;
        ctx.fillRect(cx + 12, 66, 26, 2);
      }

      // LOWER SKY CLOUD SEA (Swirling cloud canopy at y = 114..180 wrapping the mountain peaks)
      const lowCloud = (time * 14 + camX * 0.15) % 48;
      ctx.fillStyle = '#5c2238';
      ctx.fillRect(0, 126, VIEW_W, 54);
      for (let x = -lowCloud - 48; x < VIEW_W + 48; x += 40) {
        const cx = Math.round(x);
        ctx.fillStyle = '#8f353c';
        ctx.fillRect(cx, 118, 32, 14);
        ctx.fillStyle = '#cf5c3e';
        ctx.fillRect(cx + 4, 114, 24, 5);
        ctx.fillStyle = PAL.gold;
        ctx.fillRect(cx + 8, 113, 14, 1);
      }
      break;
    }
  }

  // Drifting autumn leaves / embers
  const indoor = theme === 'kitchen' || theme === 'mansion';
  for (const l of leaves) {
    ctx.fillStyle = indoor ? PAL.gold : theme === 'bamboo' || theme === 'temple' ? PAL.gold : l.color;
    const sz = indoor ? 1 : l.size;
    ctx.fillRect(Math.round(l.x), Math.round(l.y), sz, sz);
  }
}

export function generateLayout(rng: RNG, _length?: number): ChunkDef[] {
  const forests = OUTDOOR_CHUNKS.filter((c) => c.theme === 'forest');
  const bamboos = OUTDOOR_CHUNKS.filter((c) => c.theme === 'bamboo');
  const caves = OUTDOOR_CHUNKS.filter((c) => c.theme === 'cave');

  // Put Bamboo Grove and Forest/Cave right in the first two outdoor rooms so you experience them immediately!
  const firstPair = rng.shuffle([rng.pick(bamboos), rng.pick(forests)]);
  const secondPair = rng.shuffle([rng.pick(caves), rng.pick(OUTDOOR_CHUNKS)]);

  const [firstMini, secondMini] = rng.chance(0.5)
    ? [PRIEST_TEMPLE, TRAINER_COURTYARD]
    : [TRAINER_COURTYARD, PRIEST_TEMPLE];

  const mansions = rng.shuffle([...MANSION_CHUNKS]);

  return [
    ESTATE_ENTRANCE,
    firstPair[0],
    firstPair[1],
    firstMini,
    secondPair[0],
    secondPair[1],
    secondMini,
    COOK_KITCHEN,
    mansions[0],
    mansions[1],
    mansions[2],
    CLIFF_BOSS,
  ];
}
