import { PLAYER, TILE } from '../config';
import { approach, overlap, type Rect } from '../engine/math';
import type { Input } from '../engine/input';
import type { Camera } from '../engine/camera';
import { drawAnim, strokeRectPx } from '../engine/render';
import { T, type Level } from '../world/level';
import { moveBody, tilesUnderFeet, type Body } from '../world/physics';
import { defaultMods, isBossKind, rollRelic, rollEnemyDrop, type EnemyKind, type Rarity, type Relic } from '../procgen/loot';
import type { RNG } from '../procgen/rng';
import { PAL } from '../art/palette';
import { sfx, type FXManager } from '../fx/fx';

// ─── Projectiles (Maple Leaf Slash Wave) ─────────────────────────────────────

export interface LeafWave {
  x: number; y: number; vx: number; life: number; hitIds: Set<number>;
}

// ─── Chests & Pickups ────────────────────────────────────────────────────────

export interface Chest {
  x: number; y: number; rarity: Rarity; open: boolean;
}

export interface Pickup {
  x: number; y: number; vy: number; kind: 'onigiri' | 'relic'; relic?: Relic; t: number;
}

// ─── Delayed Iaijutsu Dash-Slash Mark ────────────────────────────────────────

interface DashMark {
  enemy: Enemy; timer: number; dmg: number;
}

// ─── Player (Samurai) ────────────────────────────────────────────────────────

export class Player implements Body {
  x: number; y: number;
  w = PLAYER.width; h = PLAYER.height;
  vx = 0; vy = 0;
  onGround = false;
  facing: 1 | -1 = 1;

  hp = PLAYER.maxHp;
  maxHp = PLAYER.maxHp;
  invincible = false;
  iframes = 0;
  flashT = 0;
  animT = 0;

  private coyote = 0;
  private jumpBuf = 0;
  private airJumpsLeft = 0;

  private atkT = 0;
  private atkCd = 0;
  private atkHitIds = new Set<number>();
  swingId = 0;

  private dashT = 0;
  private dashCd = 0;
  private dashHitIds = new Set<number>();
  dashMarks: DashMark[] = [];

  private parryT = 0;
  private parryCd = 0;

  mods = defaultMods();
  relics: Relic[] = [];
  kills = 0;

  constructor(x: number, y: number) {
    this.x = x - this.w / 2;
    this.y = y - this.h;
  }

  get cx(): number { return this.x + this.w / 2; }
  get cy(): number { return this.y + this.h / 2; }
  get bottom(): number { return this.y + this.h; }
  get rect(): Rect { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  get parrying(): boolean { return this.parryT > PLAYER.parryDuration - PLAYER.parryWindow; }
  get parryStance(): boolean { return this.parryT > 0; }
  get attacking(): boolean { return this.atkT > 0; }
  get dashing(): boolean { return this.dashT > 0; }

  heal(n: number): void {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  hurt(dmg: number, fromX: number, fx: FXManager, cam: Camera, ignoreIframes = false): void {
    if (!ignoreIframes && (this.iframes > 0 || this.dashing)) return;
    if (!this.invincible) {
      this.hp -= dmg;
    }
    this.iframes = PLAYER.iframes;
    this.flashT = 0.14;
    this.vy = -170;
    this.vx = (this.cx < fromX ? -1 : 1) * 140;
    sfx.hurt();
    cam.shake(4, 0.2);
    fx.freeze(0.05);
    fx.burst(this.cx, this.cy, PAL.blood, 12, 110);
    if (this.hp <= 0 && this.mods.revives > 0) {
      this.mods.revives--;
      this.hp = Math.ceil(this.maxHp / 2);
      fx.popup(this.cx, this.y - 8, 'ANCESTRAL REVIVE!', PAL.gold);
      fx.burst(this.cx, this.cy, PAL.gold, 20, 140);
    }
  }

  update(
    dt: number,
    input: Input,
    level: Level,
    enemies: Enemy[],
    leaves: LeafWave[],
    fx: FXManager,
    cam: Camera,
  ): void {
    this.animT += dt;
    this.iframes = Math.max(0, this.iframes - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.atkCd = Math.max(0, this.atkCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.parryCd = Math.max(0, this.parryCd - dt);

    // Delayed Iaijutsu dash-slash detonation
    for (let i = this.dashMarks.length - 1; i >= 0; i--) {
      const m = this.dashMarks[i];
      m.timer -= dt;
      if (m.timer <= 0) {
        this.dashMarks.splice(i, 1);
        if (m.enemy.hp > 0) {
          fx.slash(m.enemy.cx, m.enemy.cy, this.facing < 0);
          m.enemy.takeHit(m.dmg, this.cx, fx, cam, true);
        }
      }
    }

    const moveDir = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
    if (moveDir !== 0 && this.dashT <= 0 && this.parryT <= 0) this.facing = moveDir as 1 | -1;

    // Input buffering
    if (input.wasPressed('jump')) this.jumpBuf = PLAYER.jumpBuffer;
    else this.jumpBuf = Math.max(0, this.jumpBuf - dt);

    if (this.onGround) {
      this.coyote = PLAYER.coyoteTime;
      this.airJumpsLeft = this.mods.extraJumps;
    } else {
      this.coyote = Math.max(0, this.coyote - dt);
    }

    // Start Parry
    if (input.wasPressed('parry') && this.parryCd <= 0 && this.dashT <= 0) {
      this.parryT = PLAYER.parryDuration;
      this.parryCd = PLAYER.parryCooldown;
      this.vx *= 0.3;
    }

    // Start Dash-Slash (Iaijutsu)
    if (input.wasPressed('dash') && this.dashCd <= 0 && this.dashT <= 0) {
      this.swingId++;
      this.dashT = PLAYER.dashDuration;
      this.dashCd = PLAYER.dashCooldown * this.mods.dashCdMult;
      this.parryT = 0;
      this.atkT = 0;
      this.dashHitIds.clear();
      this.vy = 0;
      this.vx = this.facing * PLAYER.dashSpeed;
      sfx.dash();
      fx.burst(this.cx, this.bottom - 4, PAL.orange, 8, 70, 40);
    }

    // Start Sword Attack
    if (input.wasPressed('attack') && this.atkCd <= 0 && this.atkT <= 0 && this.dashT <= 0) {
      this.swingId++;
      this.atkT = PLAYER.attackDuration;
      this.atkCd = PLAYER.attackDuration + PLAYER.attackCooldown;
      this.parryT = 0;
      this.atkHitIds.clear();
      sfx.slash();
      fx.slash(this.cx + this.facing * 14, this.cy - 2, this.facing < 0);
      if (this.mods.leafSlash) {
        leaves.push({ x: this.cx + this.facing * 10, y: this.cy, vx: this.facing * 220, life: 0.55, hitIds: new Set() });
      }
    }

    // Horizontal + Vertical velocity
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vx = this.facing * PLAYER.dashSpeed;
      this.vy = 0;
      for (const e of enemies) {
        if (e.hp > 0 && !this.dashHitIds.has(e.id) && overlap(this.rect, e.rect)) {
          this.dashHitIds.add(e.id);
          e.stunT = Math.max(e.stunT, PLAYER.dashSlashDelay + 0.15);
          this.dashMarks.push({
            enemy: e,
            timer: PLAYER.dashSlashDelay,
            dmg: PLAYER.dashDamage + this.mods.dashDamageAdd,
          });
          fx.burst(e.cx, e.cy, PAL.white, 6, 60, 0);
        }
      }
    } else {
      const inWater = level.isInWater(this.rect);
      const maxSpd = PLAYER.runSpeed * this.mods.speedMult * (this.parryT > 0 ? 0.25 : 1) * (inWater ? 0.58 : 1);
      const accel = this.onGround ? PLAYER.accelGround : PLAYER.accelAir;
      if (moveDir !== 0) this.vx = approach(this.vx, moveDir * maxSpd, accel * dt);
      else this.vx = approach(this.vx, 0, (this.onGround ? PLAYER.friction : PLAYER.accelAir * 0.5) * dt);

      // Jump / Double Jump (reduced jump height in Waterfall Cave water)
      const dropThrough = input.isDown('down') && input.wasPressed('jump');
      if (!dropThrough && this.jumpBuf > 0 && (this.coyote > 0 || this.airJumpsLeft > 0)) {
        if (this.coyote <= 0) {
          this.airJumpsLeft--;
          fx.burst(this.cx, this.bottom, PAL.gold, 7, 60, 50);
        }
        this.vy = -PLAYER.jumpVel * (inWater ? 0.72 : 1);
        if (inWater) fx.burst(this.cx, this.bottom - 2, PAL.spirit, 6, 55, 160);
        this.coyote = 0;
        this.jumpBuf = 0;
        this.onGround = false;
        sfx.jump();
      }

      if (!input.isDown('jump') && this.vy < 0) {
        this.vy *= PLAYER.jumpCutMult;
      }

      this.vy = Math.min(PLAYER.maxFall * (inWater ? 0.7 : 1), this.vy + PLAYER.gravity * (inWater ? 0.78 : 1) * dt);

      // Bamboo Grove Hot Spring (~7s rest grants permanent buff)
      const hs = level.updateHotSpring(this.rect, dt);
      if (hs.progress > 0 && Math.random() < 0.25) {
        fx.burst(this.cx, this.bottom - 4, PAL.gold, 1, 28, -20);
      }
      if (hs.triggered) {
        this.maxHp += 1;
        this.heal(99);
        this.mods.speedMult *= 1.1;
        this.mods.damageAdd += 1;
        sfx.chest();
        fx.burst(this.cx, this.cy, PAL.gold, 22, 130, 40);
        fx.popup(this.cx, this.y - 10, 'HOT SPRING BLESSING! (+1 MAX HP & POWER)', PAL.gold);
      }
    }

    if (this.parryT > 0) this.parryT = Math.max(0, this.parryT - dt);

    // Active Sword Hitbox
    if (this.atkT > 0) {
      const elapsed = PLAYER.attackDuration - this.atkT;
      this.atkT = Math.max(0, this.atkT - dt);
      if (elapsed >= PLAYER.attackActiveStart && elapsed <= PLAYER.attackActiveEnd) {
        const hb = this.attackBox;
        for (const e of enemies) {
          if (e.hp > 0 && !this.atkHitIds.has(e.id) && overlap(hb, e.rect)) {
            this.atkHitIds.add(e.id);
            e.takeHit(PLAYER.attackDamage + this.mods.damageAdd, this.cx, fx, cam, false);
          }
        }
      }
    }

    const drop = input.isDown('down') && input.isDown('jump');
    moveBody(this, level, dt, drop);

    // Bamboo Spikes Hazard
    if (this.onGround && tilesUnderFeet(this, level).includes(T.Spike)) {
      this.hurt(1, this.cx - this.facing * 8, fx, cam);
      this.vy = -240;
    }
  }

  get attackBox(): Rect {
    const w = PLAYER.attackRange;
    const h = PLAYER.attackHeight;
    return {
      x: this.facing > 0 ? this.cx : this.cx - w,
      y: this.cy - h / 2 - 2,
      w,
      h,
    };
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, debug: boolean): void {
    if (this.iframes > 0 && Math.floor(this.iframes * 20) % 2 === 1) return;
    let key = 'player_idle';
    let t = this.animT;
    if (this.dashT > 0) key = 'player_dash';
    else if (this.parryT > 0) key = 'player_parry';
    else if (this.atkT > 0) {
      key = 'player_attack';
      t = PLAYER.attackDuration - this.atkT;
    } else if (!this.onGround) key = this.vy < 0 ? 'player_jump' : 'player_fall';
    else if (Math.abs(this.vx) > 8) key = 'player_run';

    drawAnim(ctx, key, this.cx - camX, this.bottom - camY, {
      time: t,
      flip: this.facing < 0,
      flash: this.flashT > 0 ? PAL.white : this.parrying ? PAL.gold : null,
    });

    if (debug) {
      strokeRectPx(ctx, this.x - camX, this.y - camY, this.w, this.h, '#4cff6b');
      if (this.atkT > 0) {
        const hb = this.attackBox;
        strokeRectPx(ctx, hb.x - camX, hb.y - camY, hb.w, hb.h, PAL.red);
      }
    }
  }
}

// ─── Caged Panda in Starting Room (Estate Entrance) ──────────────────────────

export let pandaKilled = false;
export function setPandaKilled(v: boolean): void {
  pandaKilled = v;
}

export class PandaNPC {
  readonly cageX: number;
  readonly cageY: number;
  x: number;
  y: number;
  w = 16;
  h = 16;
  vx = 24;
  facing: 1 | -1 = 1;
  state: 'caged' | 'freed' | 'dead' = 'caged';
  animT = 0;
  invulnT = 0;
  private lastHitSwingId = -1;

  constructor(x: number, y: number) {
    this.cageX = x;
    this.cageY = y;
    this.x = x - this.w / 2;
    this.y = y - this.h;
  }

  get cx(): number { return this.x + this.w / 2; }
  get cy(): number { return this.y + this.h / 2; }
  get bottom(): number { return this.y + this.h; }
  get rect(): Rect { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  update(dt: number, player: Player, leaves: LeafWave[], fx: FXManager, cam: Camera): void {
    this.animT += dt;
    this.invulnT = Math.max(0, this.invulnT - dt);

    if (this.state === 'freed') {
      // Happily stroll & hop back and forth outside the broken cage!
      this.x += this.vx * dt;
      if (this.cx > this.cageX + 38) {
        this.vx = -24;
        this.facing = -1;
      } else if (this.cx < this.cageX - 38) {
        this.vx = 24;
        this.facing = 1;
      }
    }

    if (this.state === 'dead') return;

    const hitBox: Rect =
      this.state === 'caged'
        ? { x: this.cageX - 14, y: this.cageY - 24, w: 28, h: 24 }
        : { x: this.cx - 13, y: this.y - 6, w: 26, h: 22 };

    const newSwing = player.swingId !== this.lastHitSwingId;
    const hitBySword =
      newSwing &&
      player.attacking &&
      (overlap(player.attackBox, hitBox) || overlap(player.rect, hitBox));
    const hitByDash = newSwing && player.dashing && overlap(player.rect, hitBox);
    let hitByLeaf = false;
    if (this.invulnT <= 0) {
      for (const l of leaves) {
        if (overlap({ x: l.x - 5, y: l.y - 4, w: 10, h: 8 }, hitBox)) {
          hitByLeaf = true;
          break;
        }
      }
    }

    if (hitBySword || hitByDash || hitByLeaf) {
      if (hitBySword || hitByDash) {
        this.lastHitSwingId = player.swingId;
      }
      this.invulnT = 0.22;
      if (this.state === 'caged') {
        // First hit breaks the cage and frees the Panda!
        this.state = 'freed';
        sfx.chest();
        cam.shake(3, 0.16);
        fx.burst(this.cageX, this.cageY - 10, PAL.woodLight, 14, 110);
        fx.burst(this.cageX, this.cageY - 10, PAL.gold, 10, 90);
      } else if (this.state === 'freed') {
        // Hitting the freed Panda kills it — angering the Clan Head!
        this.state = 'dead';
        pandaKilled = true;
        sfx.hurt();
        cam.shake(5, 0.3);
        fx.freeze(0.06);
        fx.burst(this.cx, this.cy, PAL.blood, 20, 125);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const cx = Math.round(this.cageX - camX);
    const cy = Math.round(this.cageY - camY);

    // 1. Draw the Cage (broken wooden base if freed/dead, or full locked bamboo/iron cage if caged)
    ctx.fillStyle = PAL.bark;
    ctx.fillRect(cx - 13, cy - 3, 26, 3);
    if (this.state !== 'caged') {
      // Shattered cage bars on the ground
      ctx.fillStyle = PAL.steelDark;
      ctx.fillRect(cx - 12, cy - 6, 2, 3);
      ctx.fillRect(cx + 10, cy - 5, 2, 2);
    }

    const px0 = Math.round(this.cx - camX);
    const py0 = Math.round(this.bottom - camY);

    if (this.state === 'dead') {
      // Dead panda lying motionless on its side
      ctx.fillStyle = PAL.white;
      ctx.fillRect(px0 - 7, py0 - 8, 14, 7);
      ctx.fillStyle = PAL.ink;
      ctx.fillRect(px0 - 8, py0 - 7, 4, 6);
      ctx.fillRect(px0 + 4, py0 - 5, 3, 4);
      ctx.fillRect(px0 - 5, py0 - 10, 3, 2); // ear
      // X eyes
      ctx.fillRect(px0 - 2, py0 - 6, 2, 2);
      ctx.fillStyle = PAL.blood;
      ctx.fillRect(px0 - 4, py0 - 2, 8, 2);
      return;
    }

    const hop = this.state === 'freed' ? Math.round(Math.abs(Math.sin(this.animT * 9)) * 3) : 0;
    const py = py0 - hop;

    // 2. Draw the Panda (Black & White)
    // Chubby white belly & body
    ctx.fillStyle = PAL.white;
    ctx.fillRect(px0 - 6, py - 11, 12, 9);
    // Black legs & shoulders
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(px0 - 6, py - 4, 4, 4);
    ctx.fillRect(px0 + 2, py - 4, 4, 4);
    ctx.fillRect(px0 - 7, py - 10, 14, 3);
    // Round white panda head
    ctx.fillStyle = PAL.white;
    ctx.fillRect(px0 - 5, py - 17, 10, 7);
    // Round black panda ears
    ctx.fillStyle = PAL.ink;
    const earDrop = this.state === 'caged' ? 1 : 0;
    ctx.fillRect(px0 - 6, py - 18 + earDrop, 3, 3);
    ctx.fillRect(px0 + 3, py - 18 + earDrop, 3, 3);

    if (this.state === 'caged') {
      // Very sad expression: droopy black eye patches, sad eyes & falling blue tear drops!
      ctx.fillStyle = PAL.ink;
      ctx.fillRect(px0 - 4, py - 15, 3, 2);
      ctx.fillRect(px0 + 1, py - 15, 3, 2);
      ctx.fillRect(px0 - 1, py - 12, 2, 1); // sad little nose/frown
      // Animated blue tears streaming down cheeks
      const tearOff = Math.floor((this.animT * 6) % 3);
      ctx.fillStyle = PAL.spirit;
      ctx.fillRect(px0 - 4, py - 13 + tearOff, 1, 2);
      ctx.fillRect(px0 + 3, py - 13 + ((tearOff + 1) % 3), 1, 2);

      // Draw Foreground Locked Iron/Bamboo Cage Bars over the sad panda
      ctx.fillStyle = PAL.bark;
      ctx.fillRect(cx - 13, cy - 22, 26, 3);
      ctx.fillStyle = '#2b2b3a';
      for (let bx = cx - 11; bx <= cx + 11; bx += 4) {
        ctx.fillRect(bx, cy - 19, 2, 16);
      }
      // Heavy lock on cage door
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(cx - 2, cy - 13, 4, 5);
    } else {
      // Freed & Very Happy Panda! Cheerful eyes, rosy cheeks & floating heart above head!
      ctx.fillStyle = PAL.ink;
      ctx.fillRect(px0 - 4, py - 15, 2, 1);
      ctx.fillRect(px0 + 2, py - 15, 2, 1);
      ctx.fillRect(px0 - 1, py - 13, 2, 1);
      // Rosy happy cheeks
      ctx.fillStyle = '#ff8da1';
      ctx.fillRect(px0 - 5, py - 14, 2, 1);
      ctx.fillRect(px0 + 3, py - 14, 2, 1);
      // Floating happy red heart above the freed panda
      const heartBob = Math.round(Math.sin(this.animT * 6) * 1.5);
      ctx.fillStyle = PAL.red;
      ctx.fillRect(px0 - 2, py - 23 + heartBob, 2, 2);
      ctx.fillRect(px0 + 1, py - 23 + heartBob, 2, 2);
      ctx.fillRect(px0 - 1, py - 21 + heartBob, 3, 2);
    }
  }
}

// ─── Boss Projectiles (Priest Spiritual Blasts, Cook Knives & Clan Head Mace) ─

export interface BossProjectile {
  kind: 'spirit_blast' | 'butcher_knife' | 'thrown_mace';
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  reflected: boolean;
  ownerId: number;
  animT: number;
}

export const bossProjectiles: BossProjectile[] = [];

export function clearBossProjectiles(): void {
  bossProjectiles.length = 0;
}

export function updateBossProjectiles(
  dt: number,
  player: Player,
  enemies: Enemy[],
  level: Level,
  fx: FXManager,
  cam: Camera,
): void {
  for (let i = bossProjectiles.length - 1; i >= 0; i--) {
    const p = bossProjectiles[i];
    p.animT += dt;

    // Clan Head's Panda Vengeance Thrown Mace: homes directly onto the hero for a GUARANTEED hit!
    if (p.kind === 'thrown_mace') {
      const dx = player.cx - p.x;
      const dy = player.cy - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const spd = 340;
      p.vx = (dx / d) * spd;
      p.vy = (dy / d) * spd;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (Math.random() < 0.6) fx.burst(p.x, p.y, PAL.crimson, 2, 45, 0);
      if (d < 16) {
        player.hurt(2, p.x, fx, cam, true);
        cam.shake(6.5, 0.35);
        fx.burst(player.cx, player.cy, PAL.crimson, 24, 150);
        fx.popup(player.cx, player.y - 14, 'PANDA VENGEANCE! GUARANTEED MACE HIT!', PAL.crimson);
        bossProjectiles.splice(i, 1);
      }
      continue;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;

    if (p.kind === 'spirit_blast' && Math.random() < 0.45) {
      fx.burst(p.x, p.y, PAL.spirit, 1, 25, 0);
    }

    const box: Rect = { x: p.x - 6, y: p.y - 5, w: 12, h: 10 };

    // If a thrown knife was parried back by the player, check collision against the Cook!
    if (p.reflected) {
      let hitBoss = false;
      for (const e of enemies) {
        if (e.hp > 0 && overlap(box, e.rect)) {
          e.stunT = Math.max(e.stunT, 0.85);
          e.parryVulnT = 2.0;
          e.takeHit(3, p.x, fx, cam, true);
          fx.burst(p.x, p.y, PAL.gold, 14, 130);
          fx.popup(e.cx, e.y - 10, 'PARRIED KNIFE! -3.3', PAL.gold);
          hitBoss = true;
          break;
        }
      }
      if (hitBoss) {
        bossProjectiles.splice(i, 1);
        continue;
      }
    } else {
      // Check if player parries or slashes the projectile
      const parryZone: Rect = {
        x: player.x - 10,
        y: player.y - 4,
        w: player.w + 20,
        h: player.h + 8,
      };
      const hitByParry = player.parryStance && overlap(box, parryZone);
      const hitBySlash = player.attacking && overlap(box, player.attackBox);

      if (p.kind === 'butcher_knife' && (hitByParry || hitBySlash)) {
        // Parry the Cook's thrown knife straight back at him!
        p.reflected = true;
        p.vx = -p.vx * 1.45;
        p.vy = -12;
        p.life = 2.0;
        sfx.parry();
        cam.shake(3.5, 0.16);
        fx.freeze(0.06);
        fx.burst(p.x, p.y, PAL.gold, 16, 130, 80);
        fx.popup(player.cx, player.y - 8, 'KNIFE PARRIED BACK!', PAL.gold);
        if (player.mods.parryHeal > 0) player.heal(player.mods.parryHeal);
        continue;
      }

      if (p.kind === 'spirit_blast' && hitByParry) {
        // Parrying a spiritual blast dissipates it harmlessly and stuns the Priest briefly
        sfx.parry();
        cam.shake(2.5, 0.12);
        fx.burst(p.x, p.y, PAL.spirit, 14, 110);
        fx.popup(player.cx, player.y - 8, 'SPIRIT PARRIED!', PAL.spirit);
        for (const e of enemies) {
          if (e.id === p.ownerId) {
            e.stunT = Math.max(e.stunT, 0.7);
            e.parryVulnT = 2.0;
          }
        }
        bossProjectiles.splice(i, 1);
        continue;
      }

      if (overlap(box, player.rect)) {
        player.hurt(1, p.x, fx, cam);
        fx.burst(p.x, p.y, p.kind === 'spirit_blast' ? PAL.spirit : PAL.blood, 10, 95);
        bossProjectiles.splice(i, 1);
        continue;
      }
    }

    if (p.life <= 0 || level.solidAtPx(p.x, p.y)) {
      fx.burst(p.x, p.y, p.kind === 'spirit_blast' ? PAL.spirit : PAL.steel, 5, 50);
      bossProjectiles.splice(i, 1);
    }
  }
}

export function drawBossProjectiles(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
  for (const p of bossProjectiles) {
    const sx = Math.round(p.x - camX);
    const sy = Math.round(p.y - camY);
    if (p.kind === 'spirit_blast') {
      // Glowing spiritual energy orb with golden core & cyan halo
      const pulse = Math.floor(Math.sin(p.animT * 18) * 1.5);
      ctx.fillStyle = 'rgba(123, 224, 214, 0.35)';
      ctx.fillRect(sx - 7 - pulse, sy - 6 - pulse, 14 + pulse * 2, 12 + pulse * 2);
      ctx.fillStyle = PAL.spirit;
      ctx.fillRect(sx - 5, sy - 4, 10, 8);
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(sx - 3, sy - 2, 6, 4);
      ctx.fillStyle = PAL.white;
      ctx.fillRect(sx - 2, sy - 1, 3, 2);
    } else if (p.kind === 'thrown_mace') {
      // Spinning heavy spiked iron Kanabo mace hurled by the furious Clan Head!
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(p.animT * 22);
      ctx.fillStyle = PAL.bark;
      ctx.fillRect(-9, -2, 5, 4);
      ctx.fillStyle = '#2b2b3a';
      ctx.fillRect(-4, -4, 14, 8);
      ctx.fillStyle = PAL.gold;
      for (let mx = -2; mx <= 8; mx += 4) {
        ctx.fillRect(mx, -6, 2, 2);
        ctx.fillRect(mx, 4, 2, 2);
      }
      ctx.restore();
    } else {
      // Spinning bloody butcher knife
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(p.animT * (p.reflected ? -24 : 18));
      // Handle
      ctx.fillStyle = PAL.bark;
      ctx.fillRect(-6, -1, 4, 3);
      // Heavy cleaver-knife blade
      ctx.fillStyle = p.reflected ? PAL.gold : PAL.steel;
      ctx.fillRect(-2, -3, 8, 5);
      ctx.fillStyle = PAL.white;
      ctx.fillRect(-2, -3, 8, 1);
      // Blood splatter on blade edge
      ctx.fillStyle = PAL.blood;
      ctx.fillRect(1, 0, 4, 2);
      ctx.restore();
    }
  }
}

// ─── Enemies, Minibosses (Priest, Trainer, Cook) & Final Boss (Clan Head) ────

let nextEnemyId = 1;

export class Enemy implements Body {
  readonly id = nextEnemyId++;
  x: number; y: number;
  w = 12; h = 22;
  vx = 0; vy = 0;
  onGround = false;
  facing: 1 | -1 = -1;

  hp: number;
  maxHp: number;
  phase: 1 | 2 | 3 = 1;
  state: 'patrol' | 'chase' | 'windup' | 'attack' | 'stun' = 'patrol';
  subAttack: 'melee' | 'ranged' | 'kick' | 'bearhug' = 'melee';
  stateT = 0;
  stunT = 0;
  parryVulnT = 0;
  flashT = 0;
  animT = Math.random() * 5;
  private rangedCd = 1.0;
  private jumpCd = 0.7;
  private chargeLockT = 0;
  private pandaMacePending = false;
  private pandaMaceThrown = false;
  private pandaRoared = false;
  private cliffScream = false;
  private struckPlayer = false;

  constructor(x: number, y: number, readonly kind: EnemyKind) {
    if (kind === 'priest') {
      this.w = 14;
      this.h = 24;
      this.maxHp = 36;
    } else if (kind === 'trainer') {
      this.w = 14;
      this.h = 24;
      this.maxHp = 40;
    } else if (kind === 'cook') {
      this.w = 18;
      this.h = 26;
      this.maxHp = 42;
    } else if (kind === 'final_boss') {
      this.w = 24;
      this.h = 30;
      this.maxHp = 64;
      if (pandaKilled) {
        // Furious that you killed his panda: throws his mace at the start, then uses his Greatsword!
        this.pandaMacePending = true;
        this.state = 'windup';
        this.stateT = 0.65;
      }
    } else if (kind === 'executioner') {
      this.w = 16;
      this.h = 26;
      this.maxHp = 12;
    } else if (kind === 'ronin') {
      // Common Rival Ronin: takes 3-4 hits to kill
      this.maxHp = 4;
    } else {
      // Common Ashigaru Spearman: takes 2-3 hits to kill
      this.maxHp = 3;
    }
    this.hp = this.maxHp;
    this.x = x - this.w / 2;
    this.y = y - this.h;
    if (isBossKind(kind) && !this.pandaMacePending) {
      this.state = 'chase';
      this.facing = -1;
    }
  }

  get cx(): number { return this.x + this.w / 2; }
  get cy(): number { return this.y + this.h / 2; }
  get bottom(): number { return this.y + this.h; }
  get rect(): Rect { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  get isBoss(): boolean { return isBossKind(this.kind); }

  takeHit(dmg: number, fromX: number, fx: FXManager, cam: Camera, unblockable: boolean): void {
    // Final Boss Phase 3 is completely INVULNERABLE — must be lured off the cliff!
    if (this.kind === 'final_boss' && this.phase === 3) {
      sfx.parry();
      this.flashT = 0.08;
      fx.burst(this.cx, this.cy, PAL.gold, 8, 80, 30);
      fx.popup(this.cx, this.y - 10, 'INVULNERABLE! LURE OFF CLIFF!', PAL.gold);
      return;
    }

    // Ronin & Phase 1 Trainer can occasionally deflect frontal basic swings
    if (
      !unblockable &&
      (this.kind === 'ronin' || (this.kind === 'trainer' && this.phase === 1)) &&
      (this.state === 'patrol' || this.state === 'chase') &&
      Math.sign(fromX - this.cx) === this.facing &&
      Math.random() < (this.kind === 'trainer' ? 0.28 : 0.35)
    ) {
      sfx.parry();
      this.state = 'windup';
      this.subAttack = 'melee';
      this.stateT = 0.2;
      fx.burst(this.cx + this.facing * 8, this.cy - 2, PAL.gold, 8, 90, 60);
      fx.popup(this.cx, this.y - 6, 'DEFLECT', PAL.gold);
      return;
    }

    // ~1.1x damage bonus when attacking an enemy stunned by a Parry!
    const parryBonus = this.stunT > 0 || this.parryVulnT > 0;
    const finalDmg = parryBonus ? +(dmg * 1.1).toFixed(2) : dmg;
    this.hp -= finalDmg;
    this.flashT = 0.12;
    if (parryBonus) {
      fx.popup(this.cx, this.y - 8, '1.1x PARRY HIT!', PAL.gold);
    }

    // ─── Boss Phase Transitions ──────────────────────────────────────────────
    if (this.kind === 'priest' && this.phase === 1 && this.hp <= Math.ceil(this.maxHp / 2)) {
      this.phase = 2;
      this.stunT = 0.45;
      this.rangedCd = 0.35;
      sfx.chest();
      cam.shake(4.5, 0.25);
      fx.burst(this.cx, this.cy, PAL.spirit, 26, 150);
      fx.popup(this.cx, this.y - 12, 'PHASE II: SPIRITUAL AWAKENING!', PAL.spirit);
    } else if (this.kind === 'trainer' && this.phase === 1 && this.hp <= Math.ceil(this.maxHp / 2)) {
      this.phase = 2;
      this.stunT = 0.45;
      sfx.parry();
      cam.shake(4.5, 0.25);
      fx.burst(this.cx, this.cy, PAL.white, 24, 145);
      fx.popup(this.cx, this.y - 12, 'PHASE II: DUAL KATANAS!', PAL.gold);
    } else if (this.kind === 'cook' && this.phase === 1 && this.hp <= Math.ceil(this.maxHp / 2)) {
      this.phase = 2;
      this.stunT = 0.45;
      this.rangedCd = 0.35;
      sfx.slash();
      cam.shake(4.5, 0.25);
      fx.burst(this.cx, this.cy, PAL.blood, 26, 145);
      fx.popup(this.cx, this.y - 12, 'PHASE II: BUTCHER KNIFE BARRAGE!', PAL.red);
    } else if (this.kind === 'final_boss') {
      if (this.phase === 1 && this.hp <= 38) {
        this.hp = Math.max(this.hp, 38);
        this.phase = 2;
        this.stunT = 0.5;
        sfx.parry();
        cam.shake(5, 0.3);
        fx.burst(this.cx, this.cy, PAL.gold, 28, 155);
        fx.popup(this.cx, this.y - 14, 'PHASE II: ODACHI GREATSWORD!', PAL.gold);
      } else if (this.phase <= 2 && this.hp <= 12) {
        // Trigger Phase 3: Invulnerable Bear-Hug Rage!
        this.hp = 12;
        this.phase = 3;
        this.stunT = 0;
        this.state = 'windup';
        this.subAttack = 'bearhug';
        this.stateT = 0.75; // Roar telegraph
        this.chargeLockT = 0;
        sfx.hurt();
        sfx.dash();
        cam.shake(7, 0.55);
        fx.burst(this.cx, this.cy, PAL.crimson, 36, 175);
        fx.burst(this.cx, this.cy, PAL.gold, 22, 130);
        fx.popup(this.cx, this.y - 16, 'ROAAAR! INVULNERABLE — LURE HIM OFF THE CLIFF!', PAL.crimson);
        return;
      }
    }

    const heavy = this.kind === 'executioner' || this.kind === 'cook' || this.kind === 'final_boss';
    this.stunT = Math.max(this.stunT, heavy ? 0.1 : this.isBoss ? 0.16 : 0.28);
    this.vx = (this.cx < fromX ? -1 : 1) * (heavy ? 38 : this.isBoss ? 65 : 110);
    this.vy = heavy ? -50 : -90;
    sfx.hit();
    cam.shake(this.hp <= 0 ? 4.5 : 2, 0.14);
    fx.freeze(0.045);
    fx.burst(this.cx, this.cy, PAL.blood, this.hp <= 0 ? 20 : 8, 115);
  }

  update(dt: number, player: Player, level: Level, fx: FXManager, cam: Camera): void {
    this.animT += dt;
    this.flashT = Math.max(0, this.flashT - dt);
    this.parryVulnT = Math.max(0, this.parryVulnT - dt);
    this.rangedCd = Math.max(0, this.rangedCd - dt);
    this.jumpCd = Math.max(0, this.jumpCd - dt);
    this.chargeLockT = Math.max(0, this.chargeLockT - dt);

    const dx = player.cx - this.cx;
    const dy = player.cy - this.cy;
    const dist = Math.abs(dx);
    const heroInHotSpring = level.hotSprings.some((hs) => overlap(player.rect, hs.rect));

    // ─── Clan Head Panda Vengeance Opening: Throws Mace for Guaranteed Hit, Then Uses Sword!
    if (this.kind === 'final_boss' && pandaKilled && !this.pandaMaceThrown && !this.pandaMacePending) {
      this.pandaMacePending = true;
      this.state = 'windup';
      this.stateT = 0.65;
    }
    if (this.kind === 'final_boss' && this.pandaMacePending) {
      this.facing = dx >= 0 ? 1 : -1;
      this.state = 'windup';
      if (!this.pandaRoared) {
        this.pandaRoared = true;
        sfx.hurt();
        cam.shake(5.5, 0.35);
        fx.burst(this.cx, this.cy, PAL.crimson, 24, 140);
      }
      this.stateT -= dt;
      if (this.stateT <= 0) {
        this.pandaMacePending = false;
        this.pandaMaceThrown = true;
        bossProjectiles.push({
          kind: 'thrown_mace',
          x: this.cx + this.facing * 12,
          y: this.cy - 4,
          vx: this.facing * 320,
          vy: 0,
          life: 6.0,
          reflected: false,
          ownerId: this.id,
          animT: 0,
        });
        sfx.dash();
        // Having thrown his mace at the player, he immediately draws his Greatsword from the start!
        this.phase = 2;
        this.state = 'chase';
      }
      this.vy = Math.min(PLAYER.maxFall, this.vy + PLAYER.gravity * dt);
      moveBody(this, level, dt);
      return;
    }

    // ─── Final Boss Phase 3: Invulnerable Bear-Hug Chase & Cliff Fall ────────
    if (this.kind === 'final_boss' && this.phase === 3) {
      if (this.state === 'windup') {
        this.stateT -= dt;
        this.vx = approach(this.vx, 0, 500 * dt);
        if (Math.random() < 0.45) {
          fx.burst(this.cx, this.cy - 4, PAL.crimson, 2, 95, -40);
        }
        if (this.stateT <= 0) {
          this.state = 'attack';
          this.subAttack = 'bearhug';
        }
      } else {
        // Committed Bull-Charge toward the player: once he charges near the player or cliff, he locks direction!
        if (this.chargeLockT <= 0) {
          this.facing = dx >= 0 ? 1 : -1;
          if (dist < 130) {
            this.chargeLockT = 0.78;
            sfx.dash();
            cam.shake(2.5, 0.15);
            fx.burst(this.cx, this.bottom - 2, PAL.orange, 6, 65, 30);
          }
        }

        // Final Boss can also leap up onto platforms in Phase 3 if the player tries to hide above him!
        if (this.onGround && this.jumpCd <= 0 && dy < -14 && dist < 140 && this.cx < 345) {
          this.vy = -330;
          this.onGround = false;
          this.jumpCd = 1.25;
          sfx.jump();
          fx.burst(this.cx, this.bottom, PAL.crimson, 7, 65, 35);
        }

        const chargeSpd = this.chargeLockT > 0 ? 132 : 94;
        this.vx = approach(this.vx, this.facing * chargeSpd, 620 * dt);

        // Once his charge carries him onto the right cliff brink (x >= 372), carry him fully over the edge!
        if (this.cx >= 372 && this.vx > 0) {
          this.vx = 125;
          this.facing = 1;
          this.chargeLockT = 0.5;
        }

        // Dramatic scream as he plummets off the cliff precipice
        if (!this.cliffScream && this.cx >= 384 && this.y > 142) {
          this.cliffScream = true;
          sfx.hurt();
          cam.shake(6, 0.45);
          fx.burst(this.cx, this.cy, PAL.gold, 24, 140);
          fx.popup(this.cx - 24, this.y - 12, 'AAAARGH!!', PAL.gold);
        }

        // Instakill Bear-Hug Grab if he catches the player (jumping over his head is safe!)
        const grabBox: Rect = {
          x: this.cx - 8,
          y: this.y + 9,
          w: 16,
          h: this.h - 9,
        };
        if (!player.dashing && overlap(grabBox, player.rect) && player.bottom > this.y + 11) {
          player.mods.revives = 0;
          player.hurt(999, this.cx, fx, cam, true);
          cam.shake(7, 0.4);
          fx.popup(player.cx, player.y - 14, 'CRUSHED BY BEAR HUG!', PAL.crimson);
        }
      }

      this.vy = Math.min(PLAYER.maxFall, this.vy + PLAYER.gravity * dt);
      const dropP3 = this.onGround && dy > 18 && this.cx < 350;
      moveBody(this, level, dt, dropP3);
      return;
    }

    // ─── Standard & Multi-Phase Boss State Machine ───────────────────────────
    if (this.stunT > 0) {
      this.stunT -= dt;
      this.state = 'stun';
      this.vx = approach(this.vx, 0, 500 * dt);
    } else {
      const inWater = level.isInWater(this.rect);
      let baseSpd = 50;
      if (this.kind === 'spear') baseSpd = 58;
      else if (this.kind === 'ronin') baseSpd = 78;
      else if (this.kind === 'priest') baseSpd = this.phase === 2 ? 84 : 70;
      else if (this.kind === 'trainer') baseSpd = this.phase === 2 ? 94 : 78;
      else if (this.kind === 'cook') baseSpd = this.phase === 2 ? 72 : 62;
      else if (this.kind === 'final_boss') baseSpd = this.phase === 2 ? 66 : 54;

      const spd = baseSpd * (inWater ? 0.58 : 1);

      let atkRange = 28;
      if (this.kind === 'spear') atkRange = 32;
      else if (this.kind === 'ronin') atkRange = 24;
      else if (this.kind === 'priest') atkRange = this.phase === 2 ? 32 : 24;
      else if (this.kind === 'trainer') atkRange = this.phase === 2 ? 32 : 26;
      else if (this.kind === 'cook') atkRange = 30;
      else if (this.kind === 'final_boss') atkRange = this.phase === 2 ? 38 : 34;

      switch (this.state) {
        case 'stun':
          this.state = 'chase';
          break;
        case 'patrol': {
          if (this.isBoss || heroInHotSpring) {
            this.state = 'chase';
            break;
          }
          const probeX = this.cx + this.facing * (this.w / 2 + 4);
          const probeTx = Math.floor(probeX / TILE);
          const probeTy = Math.floor((this.bottom + 2) / TILE);
          const isHazard = level.tileAt(probeTx, probeTy) === T.Spike || level.tileAt(probeTx, probeTy + 1) === T.Spike;
          const canStepOrBasin =
            !isHazard &&
            (level.standableAtPx(probeX, this.bottom + 2) || level.standableAtPx(probeX, this.bottom + TILE + 2));
          if (!canStepOrBasin || level.solidAtPx(probeX, this.cy)) {
            this.facing = (this.facing * -1) as 1 | -1;
          }
          this.vx = this.facing * spd * 0.55;
          if (dist < 145 && Math.abs(dy) < 54) this.state = 'chase';
          break;
        }
        case 'chase': {
          if (!this.isBoss && !heroInHotSpring && dist > 200) {
            this.state = 'patrol';
            break;
          }
          this.facing = dx >= 0 ? 1 : -1;
          const probeX = this.cx + this.facing * (this.w / 2 + 4);
          const probeTx = Math.floor(probeX / TILE);
          const probeTy = Math.floor((this.bottom + 2) / TILE);
          const isHazard = level.tileAt(probeTx, probeTy) === T.Spike || level.tileAt(probeTx, probeTy + 1) === T.Spike;
          // Enemies step right down into the sunken 16px Hot Spring or Waterfall Lagoon to confront the hero!
          const safeStep =
            !isHazard &&
            (level.standableAtPx(probeX, this.bottom + 2) || level.standableAtPx(probeX, this.bottom + TILE + 2));
          this.vx = (!this.onGround || safeStep) && dist > atkRange * 0.7 ? this.facing * spd : 0;

          // ALL BOSSES (Priest, Trainer, Cook, Final Boss) JUMPING ABILITY: Leap onto slabs/platforms or bound toward the hero!
          if (this.isBoss && this.onGround && this.jumpCd <= 0) {
            const heroHigher = dy < -14 && dist < 155;
            const gapOrBound = dist > 38 && dist < 130 && Math.random() < 0.038;
            if (heroHigher || gapOrBound) {
              this.vy = -330; // ~60px apex to easily reach elevated slabs in every boss room
              this.vx = this.facing * 122;
              this.onGround = false;
              this.jumpCd = 1.25;
              sfx.jump();
              fx.burst(this.cx, this.bottom, PAL.cream, 7, 65, 35);
            }
          }

          // Priest Phase 2: Spiritual Blast ranged projectile when at medium/long distance
          if (this.kind === 'priest' && this.phase === 2 && this.rangedCd <= 0 && dist > 52 && Math.abs(dy) < 48) {
            this.state = 'windup';
            this.subAttack = 'ranged';
            this.stateT = 0.34;
            this.rangedCd = 1.45;
            this.vx = 0;
            break;
          }

          // Cook Phase 2: Throw spinning Butcher Knife when at medium/long distance
          if (this.kind === 'cook' && this.phase === 2 && this.rangedCd <= 0 && dist > 50 && Math.abs(dy) < 48) {
            this.state = 'windup';
            this.subAttack = 'ranged';
            this.stateT = 0.34;
            this.rangedCd = 1.65;
            this.vx = 0;
            break;
          }

          if (dist <= atkRange && Math.abs(dy) < 32) {
            this.state = 'windup';
            if (this.kind === 'priest' && this.phase === 2) {
              this.subAttack = 'kick';
              this.stateT = 0.24;
            } else {
              this.subAttack = 'melee';
              this.stateT =
                this.kind === 'priest'
                  ? 0.22
                  : this.kind === 'trainer'
                    ? this.phase === 2 ? 0.22 : 0.26
                    : this.kind === 'cook'
                      ? 0.38
                      : this.kind === 'final_boss'
                        ? this.phase === 2 ? 0.36 : 0.44
                        : this.kind === 'spear'
                          ? 0.34
                          : this.kind === 'ronin'
                            ? 0.25
                            : 0.45;
            }
            this.vx = 0;
          }
          break;
        }
        case 'windup':
          this.stateT -= dt;
          this.vx = approach(this.vx, 0, 600 * dt);
          if (this.stateT <= 0) {
            if (this.subAttack === 'ranged') {
              // Fire Priest Spiritual Blast or Cook Thrown Butcher Knife
              const projKind = this.kind === 'priest' ? 'spirit_blast' : 'butcher_knife';
              const pSpeed = this.kind === 'priest' ? 160 : 148;
              bossProjectiles.push({
                kind: projKind,
                x: this.cx + this.facing * 10,
                y: this.cy - 2,
                vx: this.facing * pSpeed,
                vy: 0,
                life: 2.2,
                reflected: false,
                ownerId: this.id,
                animT: 0,
              });
              sfx.slash();
              fx.burst(
                this.cx + this.facing * 10,
                this.cy - 2,
                projKind === 'spirit_blast' ? PAL.spirit : PAL.steel,
                8,
                75,
              );
              this.state = 'chase';
            } else {
              this.state = 'attack';
              this.stateT = this.kind === 'final_boss' ? 0.26 : 0.22;
              this.struckPlayer = false;
              if (this.kind === 'priest' && this.subAttack === 'kick') {
                // Flying martial arts spirit kick!
                this.vx = this.facing * 155;
                this.vy = -105;
                fx.burst(this.cx, this.cy, PAL.spirit, 8, 80);
              } else if (this.kind === 'trainer' && this.phase === 2) {
                this.vx = this.facing * 165;
              } else if (this.kind === 'final_boss') {
                this.vx = this.facing * (this.phase === 2 ? 130 : 95);
                cam.shake(3.5, 0.18);
              } else {
                this.vx = this.facing * (this.kind === 'ronin' || this.kind === 'trainer' ? 145 : 95);
              }
              sfx.slash();
            }
          }
          break;
        case 'attack': {
          this.stateT -= dt;
          this.vx = approach(this.vx, 0, 520 * dt);
          let reach = 22;
          if (this.kind === 'spear') reach = 28;
          else if (this.kind === 'priest') reach = this.subAttack === 'kick' ? 28 : 22;
          else if (this.kind === 'trainer') reach = this.phase === 2 ? 30 : 25;
          else if (this.kind === 'cook') reach = 26;
          else if (this.kind === 'final_boss') reach = this.phase === 2 ? 36 : 30;

          const hb: Rect = {
            x: this.facing > 0 ? this.cx : this.cx - reach,
            y: this.y + 2,
            w: reach,
            h: this.h - 4,
          };
          if (!this.struckPlayer && overlap(hb, player.rect)) {
            this.struckPlayer = true;
            if (player.parrying) {
              sfx.parry();
              cam.shake(3.5, 0.16);
              fx.freeze(0.07);
              fx.burst((this.cx + player.cx) / 2, player.cy - 2, PAL.gold, 14, 130, 80);
              fx.popup(player.cx, player.y - 6, 'PARRY! (1.1x DMG)', PAL.gold);
              this.stunT = this.isBoss ? 0.9 : 1.25;
              this.parryVulnT = 2.2;
              this.vx = -this.facing * (this.isBoss ? 90 : 130);
              if (player.mods.parryHeal > 0) player.heal(player.mods.parryHeal);
            } else {
              // Damage table per user specification:
              // - Trainer Phase 2 (dual katanas): 2 hearts
              // - Cook (heavy cleaver): 2 hearts
              // - Final Boss Phase 1 (heavy mace) & Phase 2 (greatsword): 2 hearts
              // - Executioner: 2 hearts
              const dealsTwoHearts =
                this.kind === 'executioner' ||
                this.kind === 'cook' ||
                this.kind === 'final_boss' ||
                (this.kind === 'trainer' && this.phase === 2);
              player.hurt(dealsTwoHearts ? 2 : 1, this.cx, fx, cam);
            }
          }
          if (this.stateT <= 0) {
            this.state = 'chase';
          }
          break;
        }
      }
    }

    this.vy = Math.min(PLAYER.maxFall, this.vy + PLAYER.gravity * dt);
    // Allow Cook (and chasing enemies on elevated platforms) to drop down through kitchen slabs when the hero is below!
    const dropThrough = this.state === 'chase' && this.onGround && dy > 18;
    const res = moveBody(this, level, dt, dropThrough);
    if (res.hitWall) {
      if (this.state === 'patrol') {
        this.facing = (this.facing * -1) as 1 | -1;
      } else if (this.state === 'chase' && this.onGround) {
        // Hop up 1-tile steps (e.g., climbing in/out of the sunken Hot Spring or Waterfall basin)
        const stepClear = !level.solidAtPx(this.cx + this.facing * (this.w / 2 + 4), this.y - 4);
        if (stepClear) {
          this.vy = -235;
          this.onGround = false;
        }
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, debug: boolean): void {
    const sx = Math.round(this.cx - camX);
    const sy = Math.round(this.bottom - camY);

    if (this.kind === 'priest') {
      drawPriestBoss(ctx, this, sx, sy);
    } else if (this.kind === 'trainer') {
      drawTrainerBoss(ctx, this, sx, sy);
    } else if (this.kind === 'cook') {
      drawCookBoss(ctx, this, sx, sy);
    } else if (this.kind === 'final_boss') {
      drawClanHeadBoss(ctx, this, sx, sy);
    } else {
      const prefix = this.kind === 'spear' ? 'spear' : 'ronin';
      let suffix = 'idle';
      if (this.stunT > 0) suffix = 'stun';
      else if (this.state === 'windup') suffix = 'windup';
      else if (this.state === 'attack') suffix = 'attack';
      else if (Math.abs(this.vx) > 5) suffix = 'walk';

      if (this.kind === 'executioner') {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(1.25, 1.25);
        drawAnim(ctx, `${prefix}_${suffix}`, 0, 0, {
          time: this.animT,
          flip: this.facing < 0,
          flash: this.flashT > 0 ? PAL.white : this.state === 'windup' ? PAL.red : null,
        });
        ctx.restore();
      } else {
        drawAnim(ctx, `${prefix}_${suffix}`, sx, sy, {
          time: this.animT,
          flip: this.facing < 0,
          flash: this.flashT > 0 ? PAL.white : this.state === 'windup' ? PAL.amber : null,
        });
      }
    }

    // Telegraph exclamation during windup
    if (this.state === 'windup') {
      ctx.fillStyle = this.phase >= 2 ? PAL.crimson : PAL.gold;
      ctx.fillRect(sx - 1, Math.round(this.y - camY - 10), 2, 4);
      ctx.fillRect(sx - 1, Math.round(this.y - camY - 5), 2, 1);
    }

    // Overhead HP pips for regular enemies & executioner (Bosses also get the full Boss HUD bar)
    if (this.hp < this.maxHp || this.kind === 'executioner' || this.isBoss) {
      const bw = Math.min(48, this.maxHp * 2);
      const bx = sx - Math.floor(bw / 2);
      const by = Math.round(this.y - camY - 4);
      ctx.fillStyle = PAL.ink;
      ctx.fillRect(bx - 1, by - 1, bw + 2, 3);
      ctx.fillStyle = this.kind === 'final_boss' && this.phase === 3 ? PAL.gold : PAL.red;
      ctx.fillRect(bx, by, Math.max(1, Math.round((this.hp / this.maxHp) * bw)), 1);
    }

    if (debug) {
      strokeRectPx(ctx, this.x - camX, this.y - camY, this.w, this.h, PAL.amber);
    }
  }
}

// ─── Bespoke Pixel-Art Renderers for the 4 Bosses ────────────────────────────

function drawPriestBoss(ctx: CanvasRenderingContext2D, e: Enemy, sx: number, sy: number): void {
  ctx.save();
  ctx.translate(sx, sy);
  if (e.facing < 0) ctx.scale(-1, 1);

  const bob = Math.abs(e.vx) > 5 ? Math.floor(Math.sin(e.animT * 10) * 1.2) : Math.floor(Math.sin(e.animT * 3) * 0.8);
  const beardSway = Math.round(Math.sin(e.animT * 4) * 1.5);
  const kicking = e.state === 'attack' && e.subAttack === 'kick';
  const punching = e.state === 'attack' && e.subAttack === 'melee';
  const channeling = e.state === 'windup' && e.subAttack === 'ranged';

  // Phase 2 glowing spiritual aura
  if (e.phase === 2) {
    ctx.fillStyle = 'rgba(123, 224, 214, 0.25)';
    ctx.fillRect(-10, -26 + bob, 20, 26);
    ctx.fillStyle = 'rgba(247, 210, 106, 0.22)';
    ctx.fillRect(-8, -24 + bob, 16, 22);
  }

  // Flowing robes in a striking palette (Vibrant Saffron Gold, Vermilion Crimson, Royal Indigo & Jade trim)
  // Wide flowing skirt/hakama base
  ctx.fillStyle = '#2e1d4f'; // deep royal purple-indigo under-robe
  ctx.fillRect(-7, -10, 14, 9);
  ctx.fillStyle = '#d13b27'; // striking vermilion crimson outer panels
  ctx.fillRect(-8, -11 + bob, 5, 9);
  ctx.fillRect(3, -11 + bob, 5, 9);
  ctx.fillStyle = '#f2a33a'; // saffron gold inner robe & trim
  ctx.fillRect(-3, -16 + bob, 6, 15);
  // Jade-cyan ceremonial sash & stole
  ctx.fillStyle = '#3ec9a7';
  ctx.fillRect(-6, -13 + bob, 12, 2);
  ctx.fillRect(-6, -18 + bob, 2, 9);
  ctx.fillRect(4, -18 + bob, 2, 9);

  // Flowing wide sleeves
  ctx.fillStyle = '#f2a33a';
  ctx.fillRect(-9, -18 + bob, 4, 7);
  ctx.fillRect(5, -18 + bob, 4, 7);
  ctx.fillStyle = '#d13b27';
  ctx.fillRect(-9, -13 + bob, 4, 2);
  ctx.fillRect(5, -13 + bob, 4, 2);

  // Phase 2 Flying Kick leg extension!
  if (kicking) {
    ctx.fillStyle = '#2e1d4f';
    ctx.fillRect(4, -11, 10, 4);
    ctx.fillStyle = PAL.spirit;
    ctx.fillRect(11, -12, 5, 5);
  } else {
    // Sandals
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(-5, -2, 4, 2);
    ctx.fillRect(2, -2, 4, 2);
  }

  // Head
  ctx.fillStyle = '#e0b183';
  ctx.fillRect(-4, -24 + bob, 8, 6);
  // Gold priest crown/mitre band
  ctx.fillStyle = '#2e1d4f';
  ctx.fillRect(-4, -26 + bob, 8, 2);
  ctx.fillStyle = PAL.gold;
  ctx.fillRect(-2, -27 + bob, 4, 2);

  // BUSHY EYEBROWS (thick white eyebrows jutting out)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-5, -23 + bob, 4, 2);
  ctx.fillRect(1, -23 + bob, 5, 2);

  // EYES: Phase 1 almost closed slits vs Phase 2 wide open & GLOWING!
  if (e.phase === 1) {
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(-3, -21 + bob, 2, 1);
    ctx.fillRect(2, -21 + bob, 2, 1);
  } else {
    ctx.fillStyle = PAL.spirit;
    ctx.fillRect(-3, -22 + bob, 3, 2);
    ctx.fillRect(1, -22 + bob, 3, 2);
    ctx.fillStyle = PAL.white;
    ctx.fillRect(-2, -22 + bob, 1, 1);
    ctx.fillRect(2, -22 + bob, 1, 1);
  }

  // VERY LONG BEARD (cascading white/silver beard reaching all the way down to his feet!)
  ctx.fillStyle = '#f5efe2';
  ctx.fillRect(-3, -19 + bob, 6, 5);
  ctx.fillRect(-2 + Math.trunc(beardSway * 0.4), -14 + bob, 5, 6);
  ctx.fillStyle = '#d8d0c2';
  ctx.fillRect(-2 + beardSway, -8 + bob, 4, 5);
  ctx.fillRect(-1 + beardSway, -3 + bob, 2, 2);

  // Phase 1 Fist Attack OR Phase 2 Spiritual Blast Channeling
  if (punching) {
    ctx.fillStyle = '#f2a33a';
    ctx.fillRect(5, -17 + bob, 7, 4);
    ctx.fillStyle = '#e0b183';
    ctx.fillRect(11, -17 + bob, 4, 4);
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(14, -18 + bob, 2, 6);
  } else if (channeling) {
    ctx.fillStyle = PAL.spirit;
    ctx.fillRect(6, -17 + bob, 6, 6);
    ctx.fillStyle = PAL.white;
    ctx.fillRect(8, -15 + bob, 2, 2);
  }

  if (e.flashT > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillRect(-8, -26 + bob, 16, 26);
  }
  ctx.restore();
}

function drawTrainerBoss(ctx: CanvasRenderingContext2D, e: Enemy, sx: number, sy: number): void {
  ctx.save();
  ctx.translate(sx, sy);
  if (e.facing < 0) ctx.scale(-1, 1);

  const bob = Math.abs(e.vx) > 5 ? Math.floor(Math.sin(e.animT * 12) * 1.2) : Math.floor(Math.sin(e.animT * 3) * 0.6);
  const attacking = e.state === 'attack';
  const windup = e.state === 'windup';

  // SHEATH ON HIS BACK (angled diagonally behind torso)
  ctx.fillStyle = '#1c1424';
  for (let i = 0; i < 12; i++) {
    ctx.fillRect(-7 + i, -25 + i + bob, 2, 2);
  }
  ctx.fillStyle = PAL.crimson;
  ctx.fillRect(-5, -23 + bob, 2, 2);
  // In Phase 1, the second katana is still in the back sheath (hilt protruding behind shoulder)
  if (e.phase === 1) {
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(-8, -26 + bob, 2, 2);
    ctx.fillStyle = PAL.white;
    ctx.fillRect(-10, -28 + bob, 3, 2);
  }

  // Legs / White Martial Arts Trousers (Hakama / Keikogi)
  ctx.fillStyle = '#e8e2d5';
  ctx.fillRect(-5, -9, 10, 7);
  ctx.fillStyle = '#c9c0b0';
  ctx.fillRect(-1, -8, 1, 6);
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(-5, -2, 4, 2);
  ctx.fillRect(1, -2, 4, 2);

  // Crisp White Martial Arts Top (Keikogi)
  ctx.fillStyle = '#f7f4ed';
  ctx.fillRect(-5, -18 + bob, 10, 9);
  ctx.fillStyle = '#d6cfc2';
  ctx.fillRect(-5, -18 + bob, 2, 9);
  // Crossed lapel & Black Master Obi Belt
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(-5, -11 + bob, 10, 2);
  ctx.fillRect(-1, -18 + bob, 2, 4);

  // BALD, CLEAN-SHAVEN HEAD
  ctx.fillStyle = '#e3b486';
  ctx.fillRect(-4, -24 + bob, 8, 6);
  // Smooth bald dome & shine highlight (no hair, no beard)
  ctx.fillStyle = '#edc49b';
  ctx.fillRect(-3, -25 + bob, 6, 1);
  ctx.fillStyle = '#fff0dc';
  ctx.fillRect(-2, -25 + bob, 2, 1);
  // Focused eyes & stern eyebrows
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(-2, -22 + bob, 2, 1);
  ctx.fillRect(2, -22 + bob, 2, 1);
  ctx.fillRect(1, -21 + bob, 1, 1);

  // KATANAS: Phase 1 = Single Katana | Phase 2 = Dual-Wielding Two Katanas!
  if (attacking) {
    // Primary katana slash forward
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(4, -15 + bob, 2, 3);
    ctx.fillStyle = PAL.white;
    ctx.fillRect(6, -15 + bob, 16, 2);
    ctx.fillStyle = PAL.steel;
    ctx.fillRect(6, -13 + bob, 14, 1);

    if (e.phase === 2) {
      // Second katana twin-slash arc!
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(3, -19 + bob, 2, 3);
      ctx.fillStyle = PAL.white;
      ctx.fillRect(5, -20 + bob, 17, 2);
      ctx.fillStyle = PAL.crimson;
      ctx.fillRect(8, -18 + bob, 12, 1);
    }
  } else {
    const tilt = windup ? -3 : 0;
    // Right hand katana
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(4, -14 + bob, 2, 2);
    ctx.fillStyle = PAL.steel;
    ctx.fillRect(6, -21 + bob + tilt, 2, 8);
    ctx.fillStyle = PAL.white;
    ctx.fillRect(7, -21 + bob + tilt, 1, 8);

    // Phase 2 off-hand katana (drawn from back sheath!)
    if (e.phase === 2) {
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(-7, -14 + bob, 2, 2);
      ctx.fillStyle = PAL.steel;
      ctx.fillRect(-9, -22 + bob - tilt, 2, 9);
      ctx.fillStyle = PAL.white;
      ctx.fillRect(-8, -22 + bob - tilt, 1, 9);
    }
  }

  if (e.flashT > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillRect(-6, -25 + bob, 14, 25);
  }
  ctx.restore();
}

function drawCookBoss(ctx: CanvasRenderingContext2D, e: Enemy, sx: number, sy: number): void {
  ctx.save();
  ctx.translate(sx, sy);
  if (e.facing < 0) ctx.scale(-1, 1);

  const bob = Math.abs(e.vx) > 5 ? Math.floor(Math.sin(e.animT * 9) * 1.2) : Math.floor(Math.sin(e.animT * 3) * 0.7);
  const attacking = e.state === 'attack';
  const windup = e.state === 'windup';

  // Boots & Dark Butcher Trousers
  ctx.fillStyle = '#241c29';
  ctx.fillRect(-6, -9, 12, 7);
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(-6, -2, 5, 2);
  ctx.fillRect(1, -2, 5, 2);

  // Dark Kitchen Kosode + Traditional Ivory Butcher's Apron
  ctx.fillStyle = '#33293a';
  ctx.fillRect(-7, -20 + bob, 14, 11);
  // Butcher's Apron
  ctx.fillStyle = '#e0d3be';
  ctx.fillRect(-5, -18 + bob, 11, 14);
  ctx.fillStyle = '#c4b49b';
  ctx.fillRect(-5, -11 + bob, 11, 1);

  // SPLATTERS OF BLOOD ON HIS CLOTHES (apron, chest, hem, sleeves)
  ctx.fillStyle = PAL.blood;
  ctx.fillRect(-3, -16 + bob, 4, 3);
  ctx.fillRect(1, -13 + bob, 4, 4);
  ctx.fillRect(-4, -9 + bob, 5, 3);
  ctx.fillStyle = PAL.crimson;
  ctx.fillRect(-2, -15 + bob, 2, 2);
  ctx.fillRect(2, -12 + bob, 2, 2);
  ctx.fillRect(0, -7 + bob, 3, 2);

  // Muscular bare forearms stained with blood
  ctx.fillStyle = '#d9a577';
  ctx.fillRect(-8, -16 + bob, 3, 5);
  ctx.fillRect(5, -16 + bob, 3, 5);
  ctx.fillStyle = PAL.blood;
  ctx.fillRect(6, -14 + bob, 2, 2);

  // GRIM-APPEARING HEAD with bloody Hachimaki headband
  ctx.fillStyle = '#d9a577';
  ctx.fillRect(-4, -26 + bob, 9, 6);
  // Heavy dark scowling brows, grim sunken eyes & frown
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(-3, -24 + bob, 8, 1);
  ctx.fillRect(-2, -23 + bob, 2, 1);
  ctx.fillRect(2, -23 + bob, 2, 1);
  ctx.fillRect(-1, -21 + bob, 4, 1); // grim scowl
  // Butcher's twisted Hachimaki headband with blood spot
  ctx.fillStyle = '#e8dfd1';
  ctx.fillRect(-5, -26 + bob, 10, 2);
  ctx.fillStyle = PAL.crimson;
  ctx.fillRect(2, -26 + bob, 2, 2);

  // HEAVY CLEAVER (massive rectangular butcher blade dripping with blood)
  if (attacking) {
    // Overhead Cleaver Chop forward!
    ctx.fillStyle = PAL.bark;
    ctx.fillRect(5, -14 + bob, 4, 2);
    ctx.fillStyle = PAL.steel;
    ctx.fillRect(9, -18 + bob, 11, 7);
    ctx.fillStyle = PAL.white;
    ctx.fillRect(9, -12 + bob, 11, 1);
    ctx.fillStyle = PAL.blood;
    ctx.fillRect(12, -14 + bob, 7, 2);
  } else {
    const lift = windup ? -5 : !e.onGround ? -6 : 0;
    ctx.fillStyle = PAL.bark;
    ctx.fillRect(6, -15 + bob + lift, 2, 4);
    ctx.fillStyle = PAL.steel;
    ctx.fillRect(5, -24 + bob + lift, 6, 9);
    ctx.fillStyle = PAL.white;
    ctx.fillRect(10, -24 + bob + lift, 1, 9);
    ctx.fillStyle = PAL.blood;
    ctx.fillRect(8, -21 + bob + lift, 2, 5);
  }

  // Phase 2 off-hand throwing knife ready at belt/hand
  if (e.phase === 2 && !attacking) {
    ctx.fillStyle = PAL.steel;
    ctx.fillRect(-10, -15 + bob, 4, 2);
    ctx.fillStyle = PAL.crimson;
    ctx.fillRect(-9, -14 + bob, 2, 1);
  }

  if (e.flashT > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillRect(-8, -26 + bob, 18, 26);
  }
  ctx.restore();
}

function drawClanHeadBoss(ctx: CanvasRenderingContext2D, e: Enemy, sx: number, sy: number): void {
  ctx.save();
  ctx.translate(sx, sy);
  if (e.facing < 0) ctx.scale(-1, 1);

  const bob = Math.abs(e.vx) > 5 ? Math.floor(Math.sin(e.animT * 10) * 1.5) : Math.floor(Math.sin(e.animT * 3) * 0.8);
  const attacking = e.state === 'attack';
  const windup = e.state === 'windup';

  // Phase 3 Unstoppable Rage Aura
  if (e.phase === 3) {
    ctx.fillStyle = 'rgba(209, 59, 39, 0.32)';
    ctx.fillRect(-15, -34 + bob, 30, 34);
    ctx.fillStyle = 'rgba(247, 210, 106, 0.2)';
    ctx.fillRect(-13, -31 + bob, 26, 30);
  }

  // Massive Sumo/Buddha Stance Legs & Geta Sandals
  ctx.fillStyle = '#e0b183';
  ctx.fillRect(-9, -9, 6, 7);
  ctx.fillRect(3, -9, 6, 7);
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(-10, -2, 7, 2);
  ctx.fillRect(3, -2, 7, 2);

  // Ceremonial Sumo Mawashi / Daimyo Waist Sash with Minimalist Black & White Crest
  ctx.fillStyle = PAL.crimson;
  ctx.fillRect(-11, -12 + bob, 22, 5);
  ctx.fillStyle = PAL.gold;
  ctx.fillRect(-11, -12 + bob, 22, 1);
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(-3, -11 + bob, 6, 4);
  ctx.fillStyle = PAL.white;
  ctx.fillRect(-2, -10 + bob, 4, 2);
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(-1, -10 + bob, 2, 1);

  // VERY FAT ROTUND TORSO & PROTRUDING BELLY (Japanese Buddha / Sumo Wrestler build)
  ctx.fillStyle = '#e3b486';
  ctx.fillRect(-11, -25 + bob, 22, 14);
  ctx.fillRect(-12, -22 + bob, 24, 10); // wide round belly
  // Belly shading & navel
  ctx.fillStyle = '#c79263';
  ctx.fillRect(-10, -13 + bob, 20, 1);
  ctx.fillRect(0, -14 + bob, 2, 1); // belly button

  // OPEN ROBES draped over outer shoulders and sides with gold brocade trim (leaving wide chest exposed)
  ctx.fillStyle = '#3a1e36';
  ctx.fillRect(-13, -25 + bob, 4, 16);
  ctx.fillRect(9, -25 + bob, 4, 16);
  ctx.fillStyle = PAL.crimson;
  ctx.fillRect(-10, -25 + bob, 2, 15);
  ctx.fillRect(8, -25 + bob, 2, 15);
  ctx.fillStyle = PAL.gold;
  ctx.fillRect(-9, -25 + bob, 1, 15);
  ctx.fillRect(8, -25 + bob, 1, 15);

  // MINIMALISTIC BLACK & WHITE TIGER TATTOO ON HIS BARE CHEST!
  // Clean Sumi-e black ink silhouette & stripes with stark white eyes and fangs
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(-4, -24 + bob, 2, 1); // left ear
  ctx.fillRect(2, -24 + bob, 2, 1);  // right ear
  ctx.fillRect(-4, -23 + bob, 8, 6); // minimalist black tiger head
  // Minimalist black ink stripes flanking the chest
  ctx.fillRect(-7, -22 + bob, 2, 1);
  ctx.fillRect(5, -22 + bob, 2, 1);
  ctx.fillRect(-6, -20 + bob, 2, 1);
  ctx.fillRect(4, -20 + bob, 2, 1);
  // Stark white negative-space eyes, brow mark & fangs
  ctx.fillStyle = PAL.white;
  ctx.fillRect(-1, -23 + bob, 2, 1); // white forehead mark
  ctx.fillRect(-3, -21 + bob, 2, 1); // white left eye
  ctx.fillRect(1, -21 + bob, 2, 1);  // white right eye
  ctx.fillRect(-2, -18 + bob, 1, 2); // white left fang
  ctx.fillRect(1, -18 + bob, 1, 2);  // white right fang

  // Broad Head with Buddha/Sumo Jowls, Long Earlobes & Chonmage Topknot
  ctx.fillStyle = '#e3b486';
  ctx.fillRect(-5, -31 + bob, 10, 7);
  ctx.fillRect(-6, -28 + bob, 12, 4); // wide jowls & long earlobes
  // Sumo Chonmage Topknot
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(-4, -32 + bob, 8, 2);
  ctx.fillRect(-2, -34 + bob, 4, 2);
  ctx.fillStyle = PAL.gold;
  ctx.fillRect(-1, -32 + bob, 2, 1);
  // Fierce eyes (glowing red in Phase 3!)
  ctx.fillStyle = e.phase === 3 ? PAL.red : PAL.ink;
  ctx.fillRect(-3, -29 + bob, 2, 2);
  ctx.fillRect(2, -29 + bob, 2, 2);
  if (e.phase === 3) {
    // Roaring open mouth!
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(-2, -27 + bob, 5, 3);
    ctx.fillStyle = PAL.crimson;
    ctx.fillRect(-1, -26 + bob, 3, 2);
  }

  // WEAPONS BY PHASE:
  // Phase 1: Heavy Spiked Mace (Kanabo)
  // Phase 2: Massive Greatsword (Odachi)
  // Phase 3: Unarmed Outstretched Bear-Hug Arms!
  if (e.phase === 1) {
    if (attacking) {
      // Heavy Mace Slam forward!
      ctx.fillStyle = PAL.bark;
      ctx.fillRect(8, -16 + bob, 5, 3);
      ctx.fillStyle = '#2b2b3a';
      ctx.fillRect(13, -19 + bob, 14, 7);
      ctx.fillStyle = PAL.gold;
      for (let sx2 = 15; sx2 <= 25; sx2 += 3) {
        ctx.fillRect(sx2, -21 + bob, 2, 2);
        ctx.fillRect(sx2, -12 + bob, 2, 2);
      }
    } else {
      const lift = windup ? -4 : 0;
      ctx.fillStyle = PAL.bark;
      ctx.fillRect(9, -16 + bob + lift, 3, 4);
      ctx.fillStyle = '#2b2b3a';
      ctx.fillRect(8, -30 + bob + lift, 6, 14);
      ctx.fillStyle = PAL.gold;
      for (let sy2 = -29; sy2 <= -19; sy2 += 3) {
        ctx.fillRect(7, sy2 + bob + lift, 1, 2);
        ctx.fillRect(14, sy2 + bob + lift, 2, 2);
      }
    }
  } else if (e.phase === 2) {
    if (attacking) {
      // Massive Odachi Greatsword Cleave!
      ctx.fillStyle = PAL.crimson;
      ctx.fillRect(7, -16 + bob, 5, 3);
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(12, -19 + bob, 2, 8);
      ctx.fillStyle = PAL.steel;
      ctx.fillRect(14, -18 + bob, 22, 5);
      ctx.fillStyle = PAL.white;
      ctx.fillRect(14, -18 + bob, 22, 2);
    } else {
      const lift = windup ? -5 : 0;
      ctx.fillStyle = PAL.crimson;
      ctx.fillRect(9, -16 + bob + lift, 3, 5);
      ctx.fillStyle = PAL.gold;
      ctx.fillRect(7, -18 + bob + lift, 7, 2);
      ctx.fillStyle = PAL.steel;
      ctx.fillRect(9, -36 + bob + lift, 4, 18);
      ctx.fillStyle = PAL.white;
      ctx.fillRect(12, -36 + bob + lift, 1, 18);
    }
  } else {
    // Phase 3: Wide-open Bear-Hug Arms reaching to crush the player!
    const grabReach = Math.round(Math.sin(e.animT * 16) * 2);
    ctx.fillStyle = '#e3b486';
    ctx.fillRect(9, -22 + bob, 8 + grabReach, 5);
    ctx.fillRect(-14, -22 + bob, 5, 5);
    ctx.fillStyle = PAL.crimson;
    ctx.fillRect(15 + grabReach, -23 + bob, 3, 7);
  }

  if (e.flashT > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillRect(-12, -32 + bob, 24, 32);
  }
  ctx.restore();
}


// ─── Helper to open chest / spawn drops ──────────────────────────────────────

export function openChest(c: Chest, rng: RNG, pickups: Pickup[], fx: FXManager): void {
  c.open = true;
  sfx.chest();
  fx.burst(c.x, c.y - 6, c.rarity === 'rare' ? PAL.gold : c.rarity === 'cursed' ? '#c45cff' : PAL.cream, 14, 95);
  const relic = rollRelic(rng, c.rarity);
  pickups.push({ x: c.x, y: c.y - 8, vy: -150, kind: 'relic', relic, t: 0 });
}

export function spawnEnemyDrop(e: Enemy, rng: RNG, player: Player, pickups: Pickup[]): void {
  const drop = rollEnemyDrop(rng, e.kind, player.hp, player.maxHp);
  if (!drop) return;
  if (drop === 'relic') {
    pickups.push({ x: e.cx, y: e.cy, vy: -150, kind: 'relic', relic: rollRelic(rng, 'rare'), t: 0 });
  } else {
    pickups.push({ x: e.cx, y: e.cy, vy: -130, kind: drop, t: 0 });
  }
}

export function drawTilemap(ctx: CanvasRenderingContext2D, level: Level, camX: number, camY: number): void {
  const c0 = Math.max(0, Math.floor(camX / TILE));
  const c1 = Math.min(level.width - 1, Math.ceil((camX + 320) / TILE));
  const th = level.theme;
  for (let r = 0; r < level.height; r++) {
    for (let c = c0; c <= c1; c++) {
      const t = level.tileAt(c, r);
      if (t === T.Empty) continue;
      const sx = c * TILE - camX;
      const sy = r * TILE - camY;
      if (t === T.Solid) {
        const top = !level.isSolidTile(c, r - 1);
        const v = (c + r) & 1;
        drawAnim(ctx, top ? `tile_top_${th}_${v}` : `tile_fill_${th}_${v}`, sx, sy);
      } else if (t === T.Platform) {
        drawAnim(ctx, `tile_plat_${th}`, sx, sy);
      } else if (t === T.Spike) {
        drawAnim(ctx, 'tile_spike', sx, sy);
      }
    }
  }
}
