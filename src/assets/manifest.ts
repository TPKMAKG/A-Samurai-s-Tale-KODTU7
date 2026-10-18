import type { SheetSpec } from '../engine/assets';

/**
 * ─── Real art goes here ───────────────────────────────────────────────
 * Drop PNG sprite sheets into /public/assets/ and list them below. Each entry
 * overrides the code-drawn placeholder with the same key. Frames are read
 * left-to-right from a horizontal strip (use `row` for multi-row sheets).
 *
 * Character placeholders are 48x32 frames with the feet at (24, 31), facing RIGHT.
 * Keep that convention (or set anchorX/anchorY) and nothing else needs changing.
 *
 * Keys in use:
 *   player_idle, player_run, player_jump, player_fall, player_attack (3 frames:
 *   windup/strike/follow-through), player_dash, player_parry, player_hurt
 *   spear_idle, spear_walk, spear_windup, spear_attack, spear_stun, spear_hurt
 *   ronin_idle, ronin_walk, ronin_windup, ronin_attack, ronin_stun, ronin_block, ronin_hurt
 *   tile_ground_top_0/1, tile_ground_fill_0/1, tile_platform, tile_spike
 *   decor_torii, decor_lantern, decor_gate, decor_gate_open
 *   chest_{common|rare|cursed}_{closed|open}
 *   pickup_onigiri, pickup_orb, relic_{common|rare|cursed}
 *   ui_heart_full, ui_heart_empty, fx_slash
 */
export const SPRITE_OVERRIDES: SheetSpec[] = [
  // { key: 'player_run', url: 'assets/player_run.png', frameW: 48, frameH: 32, frames: 6, fps: 12, anchorX: 24, anchorY: 31 },
];
