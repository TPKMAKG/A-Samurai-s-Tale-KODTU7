// ─────────────────────────────────────────────────────────────
// Global tuning knobs. Tweak game feel here first.
// ─────────────────────────────────────────────────────────────

export const VIEW_W = 320; // internal render resolution (pixels)
export const VIEW_H = 180;
export const TILE = 16;
export const CHUNK_W = 28; // tiles per isolated room (horizontal, 448px)
export const CHUNK_H = 12; // tiles per isolated room (vertical, 192px)
export const FIXED_DT = 1 / 60;

/** How many random chunks sit between the start chunk and the final gate arena. */
export const RUN_LENGTH = 10;

export const PLAYER = {
  width: 10,
  height: 22,
  runSpeed: 110,
  accelGround: 1400,
  accelAir: 900,
  friction: 1600,
  gravity: 900,
  maxFall: 420,
  jumpVel: 320, // ~57px apex (3.5 tiles)
  jumpCutMult: 0.45, // velocity multiplier when jump is released early
  coyoteTime: 0.1,
  jumpBuffer: 0.12,
  maxHp: 5,
  iframes: 1.0,

  attackDuration: 0.28,
  attackActiveStart: 0.04,
  attackActiveEnd: 0.14,
  attackCooldown: 0.06,
  attackRange: 26,
  attackHeight: 26,
  attackDamage: 1,

  dashSpeed: 300,
  dashDuration: 0.16,
  dashCooldown: 0.75,
  dashDamage: 1.2,
  dashSlashDelay: 0.14, // the "anime pause" before dashed-through enemies take damage

  parryWindow: 0.2, // seconds at the start of a parry that actually deflect
  parryDuration: 0.35,
  parryCooldown: 0.45,
};
