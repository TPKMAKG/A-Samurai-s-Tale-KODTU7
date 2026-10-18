/**
 * ─── Isolated Room Definitions (28 columns x 12 rows per room) ───────────────
 * Legend:
 *   .  empty                #  thematic ground/wall =  thematic platform
 *   ^  bamboo/floor spikes  ~  swamp / croc hazard  H  sunken hot spring (7s buff)
 *   W  sunken cave water    E  common enemy anchor  C  chest anchor
 *   M  miniboss/boss spot   X  room exit archway
 *
 * Thematic Props:
 *   T  torii gate           L  stone lantern        F  autumn maple tree (momiji)
 *   B  golden bamboo clump  S  temple bell/shrine   D  dojo weapon rack
 *   K  kitchen hearth/pot   P  shoji screen panel   V  cliff vista / windswept tree
 */

export type RoomTheme =
  | 'estate'
  | 'forest'
  | 'bamboo'
  | 'cave'
  | 'temple'
  | 'courtyard'
  | 'kitchen'
  | 'mansion'
  | 'cliff';

export type BossSlotKind = 'priest' | 'trainer' | 'cook' | 'final_boss';

export interface ChunkDef {
  id: string;
  name: string;
  subtitle: string;
  theme: RoomTheme;
  rows: string[];
  weight: number;
  bossKind?: BossSlotKind;
}

const SKY = '............................'; // 28 cols
const GND = '############################'; // 28 cols

// ─── 1. Starting Room: Rival Clan Estate Entrance (Courtyard) ────────────────
export const ESTATE_ENTRANCE: ChunkDef = {
  id: 'estate_entrance',
  name: 'CLAN ESTATE ENTRANCE',
  subtitle: 'Courtyard of Falling Crimson Leaves',
  theme: 'estate',
  weight: 0,
  rows: [
    SKY,
    SKY,
    SKY,
    SKY,
    SKY,
    '............................',
    '..........========..........',
    '............................',
    '.....======......======.....',
    '..L..T....F......F....L..X..',
    GND,
    GND,
  ],
};

// ─── 2. Common Outdoor Rooms (Forest Path, Bamboo Grove, Waterfall Cave) ─────

export const OUTDOOR_CHUNKS: ChunkDef[] = [
  // FOREST PATH A: Ancient autumn woodland with crocodile swamp & log bridges
  {
    id: 'forest_swamp_bridge',
    name: 'AUTUMN FOREST PATH',
    subtitle: 'Murky Crocodile Backwater',
    theme: 'forest',
    weight: 3,
    rows: [
      SKY,
      SKY,
      SKY,
      SKY,
      SKY,
      '.............C..............',
      '..........=======...........',
      '............................',
      '.....======......======.....',
      '..F..E.......F........E..X..',
      '######====..####..====######',
      '######~~~~~~####~~~~~~######',
    ],
  },
  // FOREST PATH B: Deep maple marsh with canopy branch platforms over crocodile waters
  {
    id: 'forest_croc_marsh',
    name: 'CRIMSON MAPLE MARSH',
    subtitle: 'Beware the Lurking Jaws',
    theme: 'forest',
    weight: 3,
    rows: [
      SKY,
      SKY,
      SKY,
      SKY,
      SKY,
      '................C...........',
      '............=======.........',
      '............................',
      '....=======......=======....',
      '..F..E......###.......E..X..',
      '#####~~~~~~~###~~~~~~~######',
      '#####~~~~~~~###~~~~~~~######',
    ],
  },

  // BAMBOO GROVE A: Sunken Stone Onsen Hot Spring carved into row 10 (always spawns!)
  {
    id: 'bamboo_hotspring',
    name: 'AUTUMN BAMBOO GROVE',
    subtitle: 'Steaming Onsen — Step In & Rest 7s for a Blessing',
    theme: 'bamboo',
    weight: 3,
    rows: [
      SKY,
      SKY,
      SKY,
      SKY,
      SKY,
      '.............C..............',
      '..........=======...........',
      '............................',
      '....=======......=======....',
      '..B..E..L....E.....L..E..X..',
      '#########HHHHHHHHHH#########',
      GND,
    ],
  },
  // BAMBOO GROVE B: Golden bamboo sanctuary with wide sunken mineral Hot Spring bath
  {
    id: 'bamboo_thicket',
    name: 'GOLDEN BAMBOO SANCTUARY',
    subtitle: 'Steaming Onsen — Step In & Rest 7s for a Blessing',
    theme: 'bamboo',
    weight: 3,
    rows: [
      SKY,
      SKY,
      SKY,
      SKY,
      SKY,
      '................C...........',
      '............=======.........',
      '............................',
      '....=======......=======....',
      '..B..E.B.L...E....L.B.E..X..',
      '#########HHHHHHHHHH#########',
      GND,
    ],
  },

  // WATERFALL CAVE A: Sunken subterranean river lagoon fed by rushing waterfalls
  {
    id: 'waterfall_grotto',
    name: 'WATERFALL MOSS CAVE',
    subtitle: 'Rushing Currents Slow Every Step',
    theme: 'cave',
    weight: 3,
    rows: [
      SKY,
      SKY,
      SKY,
      SKY,
      SKY,
      '.............C..............',
      '..........=======...........',
      '............................',
      '....=======......=======....',
      '..L...E...===..===...E...X..',
      '######WWWWWWWWWWWWWWWW######',
      GND,
    ],
  },
  // WATERFALL CAVE B: Twin sunken waterfall lagoons separated by a stone lantern island
  {
    id: 'waterfall_basins',
    name: 'TWIN CASCADE CAVERN',
    subtitle: 'Subterranean Autumn Stream',
    theme: 'cave',
    weight: 3,
    rows: [
      SKY,
      SKY,
      SKY,
      SKY,
      SKY,
      '.............C..............',
      '..........=======...........',
      '............................',
      '....=======......=======....',
      '..L..E..==..###..==...E..X..',
      '#####WWWWWWW###WWWWWWW######',
      GND,
    ],
  },
];

// ─── 3. Unique Miniboss Rooms (Each occurs strictly ONCE) ────────────────────

export const PRIEST_TEMPLE: ChunkDef = {
  id: 'priest_temple',
  name: 'GINKGO SHRINE TEMPLE',
  subtitle: 'Sanctum of the Fallen Priest',
  theme: 'temple',
  weight: 0,
  bossKind: 'priest',
  rows: [
    SKY,
    SKY,
    SKY,
    SKY,
    SKY,
    '.............S..............',
    '..........=======...........',
    '............................',
    '....=======......=======....',
    '..L..T.......M......T.L..X..',
    GND,
    GND,
  ],
};

export const TRAINER_COURTYARD: ChunkDef = {
  id: 'trainer_courtyard',
  name: 'DOJO TRAINING COURTYARD',
  subtitle: 'Arena of the Clan Retainer',
  theme: 'courtyard',
  weight: 0,
  bossKind: 'trainer',
  rows: [
    SKY,
    SKY,
    SKY,
    SKY,
    SKY,
    '............................',
    '..........=======...........',
    '............................',
    '....=======......=======....',
    '..L..D...F...M...F..D.L..X..',
    GND,
    GND,
  ],
};

export const COOK_KITCHEN: ChunkDef = {
  id: 'cook_kitchen',
  name: 'ESTATE GRAND KITCHEN',
  subtitle: 'Hearths & Cleavers of the Head Cook',
  theme: 'kitchen',
  weight: 0,
  bossKind: 'cook',
  rows: [
    SKY,
    SKY,
    SKY,
    SKY,
    SKY,
    '............................',
    '.......=====....=====.......',
    '............................',
    '....======........======....',
    '..L..K.......M......K.L..X..',
    GND,
    GND,
  ],
};

// ─── 4. Mansion Interior Rooms (After Cook's Kitchen, leading to Final Boss) ─

export const MANSION_CHUNKS: ChunkDef[] = [
  {
    id: 'mansion_shoji_hall',
    name: 'MANSION SHOJI GALLERY',
    subtitle: 'Candlelit Paper Screens',
    theme: 'mansion',
    weight: 3,
    rows: [
      SKY,
      SKY,
      SKY,
      SKY,
      SKY,
      '.............C..............',
      '..........=======...........',
      '............................',
      '....=======......=======....',
      '..L..P..E..........E..P..X..',
      '##########========##########',
      '##########^^^^^^^^##########',
    ],
  },
  {
    id: 'mansion_tatami_atrium',
    name: 'TATAMI GUARD ATRIUM',
    subtitle: 'Upper Keep of the Rival Clan',
    theme: 'mansion',
    weight: 3,
    rows: [
      SKY,
      SKY,
      SKY,
      SKY,
      SKY,
      '................C...........',
      '............=======.........',
      '............................',
      '....=======......=======....',
      '..P...E......L......E.P..X..',
      GND,
      GND,
    ],
  },
  {
    id: 'mansion_rafters_gallery',
    name: 'CRIMSON RAFTERS HALL',
    subtitle: 'Rafters Below the Summit',
    theme: 'mansion',
    weight: 3,
    rows: [
      SKY,
      SKY,
      SKY,
      SKY,
      SKY,
      '........C...................',
      '......=======...............',
      '............................',
      '....=======......=======....',
      '..L..E....########....E..X..',
      GND,
      GND,
    ],
  },
];

// ─── 5. Final Boss Room: High Cliff Precipice (No door! Game ends on Boss Kill)
export const CLIFF_BOSS: ChunkDef = {
  id: 'cliff_boss',
  name: 'MOONLIT AUTUMN PRECIPICE',
  subtitle: 'High Summit Overlooking the Cloud Sea',
  theme: 'cliff',
  weight: 0,
  bossKind: 'final_boss',
  rows: [
    SKY,
    SKY,
    SKY,
    SKY,
    SKY,
    '............................',
    '........=======.............',
    '............................',
    '....======....======........',
    '..L..F.......M.......L.V....',
    '########################....',
    '######################......',
  ],
};
