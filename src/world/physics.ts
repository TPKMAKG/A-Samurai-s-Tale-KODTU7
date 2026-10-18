import { TILE } from '../config';
import { T, type Level } from './level';

export interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  onGround: boolean;
}

export interface MoveResult {
  hitWall: boolean;
  hitCeiling: boolean;
}

/**
 * Axis-separated tile collision. Bodies are axis-aligned boxes (x,y = top-left).
 * One-way platforms only collide when falling onto them from above.
 */
export function moveBody(b: Body, level: Level, dt: number, dropThrough = false): MoveResult {
  const res: MoveResult = { hitWall: false, hitCeiling: false };

  // ── X ──
  let nx = b.x + b.vx * dt;
  const top = Math.floor(b.y / TILE);
  const bot = Math.floor((b.y + b.h - 0.01) / TILE);
  if (b.vx > 0) {
    const tx = Math.floor((nx + b.w - 0.01) / TILE);
    for (let ty = top; ty <= bot; ty++) {
      if (level.isSolidTile(tx, ty)) {
        nx = tx * TILE - b.w;
        b.vx = 0;
        res.hitWall = true;
        break;
      }
    }
  } else if (b.vx < 0) {
    const tx = Math.floor(nx / TILE);
    for (let ty = top; ty <= bot; ty++) {
      if (level.isSolidTile(tx, ty)) {
        nx = (tx + 1) * TILE;
        b.vx = 0;
        res.hitWall = true;
        break;
      }
    }
  }
  b.x = nx;

  // ── Y ──
  const prevBottom = b.y + b.h;
  let ny = b.y + b.vy * dt;
  b.onGround = false;
  const left = Math.floor(b.x / TILE);
  const right = Math.floor((b.x + b.w - 0.01) / TILE);
  if (b.vy > 0) {
    const ty = Math.floor((ny + b.h - 0.01) / TILE);
    for (let tx = left; tx <= right; tx++) {
      const t = level.tileAt(tx, ty);
      const solid = t === T.Solid || t === T.Spike;
      const platform = t === T.Platform && !dropThrough && prevBottom <= ty * TILE + 0.5;
      if (solid || platform) {
        ny = ty * TILE - b.h;
        b.vy = 0;
        b.onGround = true;
        break;
      }
    }
  } else if (b.vy < 0) {
    const ty = Math.floor(ny / TILE);
    for (let tx = left; tx <= right; tx++) {
      if (level.isSolidTile(tx, ty)) {
        ny = (ty + 1) * TILE;
        b.vy = 0;
        res.hitCeiling = true;
        break;
      }
    }
  }
  b.y = ny;
  return res;
}

/** Tile ids directly beneath the body's feet. */
export function tilesUnderFeet(b: Body, level: Level): number[] {
  const ty = Math.floor((b.y + b.h + 1) / TILE);
  const out: number[] = [];
  for (let tx = Math.floor(b.x / TILE); tx <= Math.floor((b.x + b.w - 0.01) / TILE); tx++) out.push(level.tileAt(tx, ty));
  return out;
}
