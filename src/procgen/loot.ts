import { RNG } from './rng';
import type { ChunkInstance } from '../world/level';

export type Rarity = 'common' | 'rare' | 'cursed';

export interface PlayerMods {
  speedMult: number;
  damageAdd: number;
  dashDamageAdd: number;
  dashCdMult: number;
  extraJumps: number;
  parryHeal: number;
  leafSlash: boolean;
  revives: number;
}

export const defaultMods = (): PlayerMods => ({
  speedMult: 1,
  damageAdd: 0,
  dashDamageAdd: 0,
  dashCdMult: 1,
  extraJumps: 0,
  parryHeal: 0,
  leafSlash: false,
  revives: 0,
});

export interface Relic {
  name: string;
  desc: string;
  rarity: Rarity;
  apply: (m: PlayerMods, healFull: () => void, hurtCurse: () => void) => void;
}

const PREFIXES: { name: string; desc: string; mod: (m: PlayerMods) => void }[] = [
  { name: 'Maple', desc: 'Attacks launch razor leaves', mod: (m) => (m.leafSlash = true) },
  { name: 'Crimson', desc: '+1 sword damage', mod: (m) => (m.damageAdd += 1) },
  { name: 'Gale', desc: '-30% dash cooldown', mod: (m) => (m.dashCdMult *= 0.7) },
  { name: 'Bloodied', desc: 'Parries restore 1 HP', mod: (m) => (m.parryHeal += 1) },
  { name: 'Thunder', desc: '+2 dash-slash damage', mod: (m) => (m.dashDamageAdd += 2) },
];

const SUFFIXES: { name: string; desc: string; mod: (m: PlayerMods) => void }[] = [
  { name: 'of the Ronin', desc: '+18% move speed', mod: (m) => (m.speedMult *= 1.18) },
  { name: 'of the Tengu', desc: '+1 air jump', mod: (m) => (m.extraJumps += 1) },
  { name: 'of the Ancestors', desc: '+1 revive on fatal hit', mod: (m) => (m.revives += 1) },
  { name: 'of Vengeance', desc: '+1 sword & dash damage', mod: (m) => { m.damageAdd += 1; m.dashDamageAdd += 1; } },
];

/** Procedurally assemble a Katana Relic from prefix + suffix + rarity scaling. */
export function rollRelic(rng: RNG, rarity: Rarity): Relic {
  const pre = rng.pick(PREFIXES);
  const suf = rng.pick(SUFFIXES);
  if (rarity === 'common') {
    const pickPre = rng.chance(0.5);
    return {
      name: pickPre ? `${pre.name} Charm` : `Charm ${suf.name}`,
      desc: pickPre ? pre.desc : suf.desc,
      rarity,
      apply: (m) => (pickPre ? pre.mod(m) : suf.mod(m)),
    };
  }
  if (rarity === 'rare') {
    return {
      name: `${pre.name} Blade ${suf.name}`,
      desc: `${pre.desc} • ${suf.desc}`,
      rarity,
      apply: (m, heal) => { pre.mod(m); suf.mod(m); heal(); },
    };
  }
  return {
    name: `Cursed ${pre.name} ${suf.name}`,
    desc: `2x effect (${pre.desc}, ${suf.desc}) • Costs 1 HP`,
    rarity,
    apply: (m, _h, hurt) => { pre.mod(m); pre.mod(m); suf.mod(m); hurt(); },
  };
}

export interface ChestSpawn {
  x: number;
  y: number;
  rarity: Rarity;
}

/** Procedural Chest Director: guarantees pacing and rewards higher platforms with rarer chests. */
export function planChests(rng: RNG, chunks: ChunkInstance[]): ChestSpawn[] {
  const out: ChestSpawn[] = [];
  let dryStreak = 0;
  for (const ch of chunks) {
    if (ch.index === 0 || ch.isFinal || ch.chestAnchors.length === 0) continue;
    dryStreak++;
    const spawnChance = dryStreak >= 2 ? 1.0 : 0.55;
    if (!rng.chance(spawnChance)) continue;
    dryStreak = 0;
    const anchor = rng.pick(ch.chestAnchors);
    const highUp = anchor.y <= 112; // elevated platform
    const rarity: Rarity = rng.weighted([
      { item: 'common', weight: highUp ? 35 : 70 },
      { item: 'rare', weight: highUp ? 45 : 22 },
      { item: 'cursed', weight: highUp ? 20 : 8 },
    ]);
    out.push({ x: anchor.x, y: anchor.y, rarity });
  }
  return out;
}

export type EnemyKind = 'spear' | 'ronin' | 'executioner' | 'priest' | 'trainer' | 'cook' | 'final_boss';

export interface EnemySpawn {
  x: number;
  y: number;
  kind: EnemyKind;
}

const COST: Record<EnemyKind, number> = {
  spear: 1,
  ronin: 2,
  executioner: 4,
  priest: 6,
  trainer: 6,
  cook: 6,
  final_boss: 10,
};

export function isBossKind(kind: EnemyKind): boolean {
  return kind === 'priest' || kind === 'trainer' || kind === 'cook' || kind === 'final_boss';
}

/** Procedural Encounter Director: spawns bosses in boss rooms, or spends threat budget across anchors. */
export function planChunkEnemies(rng: RNG, chunk: ChunkInstance): EnemySpawn[] {
  if (chunk.bossAnchor) {
    return [
      {
        x: chunk.bossAnchor.x,
        y: chunk.bossAnchor.y,
        kind: chunk.bossAnchor.kind,
      },
    ];
  }
  if (chunk.index === 0 || chunk.enemyAnchors.length === 0) return [];
  const budget = chunk.isFinal ? 6 : 2 + Math.floor(chunk.index * 0.75);
  chunk.budget = budget;
  let rem = budget;
  const anchors = rng.shuffle([...chunk.enemyAnchors]);
  const out: EnemySpawn[] = [];

  for (const a of anchors) {
    if (rem <= 0) break;
    const candidates: { item: EnemyKind; weight: number }[] = [{ item: 'spear', weight: 5 }];
    if (rem >= 2 && chunk.index >= 2) candidates.push({ item: 'ronin', weight: 3 + chunk.index });
    if (rem >= 4 && chunk.index >= 6) candidates.push({ item: 'executioner', weight: 1 });
    const kind = rng.weighted(candidates);
    out.push({ x: a.x, y: a.y, kind });
    rem -= COST[kind];
  }
  return out;
}

export type DropKind = 'onigiri' | 'relic';

/** Procedural On-Kill Drop Table: bosses and executioners guarantee a Katana Relic drop. */
export function rollEnemyDrop(rng: RNG, kind: EnemyKind, playerHp: number, maxHp: number): DropKind | null {
  if (kind === 'executioner' || isBossKind(kind)) return 'relic';
  const missingHp = maxHp - playerHp;
  const healWeight = missingHp > 0 ? 18 + missingHp * 14 : 4;
  return rng.weighted<DropKind | null>([
    { item: null, weight: 80 },
    { item: 'onigiri', weight: healWeight },
  ]);
}

