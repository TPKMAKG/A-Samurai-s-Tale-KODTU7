/**
 * Seeded RNG (mulberry32). Every procedural system draws from its own forked
 * stream so that, e.g., killing an extra enemy doesn't change the level layout.
 */
export class RNG {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Inclusive integer range. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  weighted<T>(entries: readonly { item: T; weight: number }[]): T {
    let total = 0;
    for (const e of entries) total += Math.max(0, e.weight);
    let r = this.next() * total;
    for (const e of entries) {
      r -= Math.max(0, e.weight);
      if (r < 0) return e.item;
    }
    return entries[entries.length - 1].item;
  }

  /** Derive an independent child stream. */
  fork(salt: number): RNG {
    return new RNG((Math.floor(this.next() * 4294967296) ^ Math.imul(salt, 0x9e3779b1)) >>> 0);
  }
}

/** Deterministic 0..1 hash for per-tile visual variation. */
export function hash2(x: number, y: number, seed = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 900000) + 100000;
}
