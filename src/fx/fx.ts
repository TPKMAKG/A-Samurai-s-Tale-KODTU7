import { VIEW_W, VIEW_H } from '../config';
import { PAL, LEAF_COLORS } from '../art/palette';
import { drawAnim } from '../engine/render';
import { randRange } from '../engine/math';
import { drawRoomBackground } from '../world/level';
import type { RoomTheme } from '../world/chunks';

// ─── Procedural WebAudio Synth (Zero external audio files needed) ─────────────

class SoundFX {
  private ctx: AudioContext | null = null;
  muted = false;

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx?.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  tone(f0: number, f1: number, dur: number, type: OscillatorType = 'triangle', gain = 0.12): void {
    const c = this.ensure();
    if (!c) return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  slash(): void { this.tone(520, 110, 0.09, 'sawtooth', 0.1); }
  dash(): void { this.tone(280, 680, 0.12, 'triangle', 0.12); }
  jump(): void { this.tone(220, 440, 0.08, 'sine', 0.09); }
  hit(): void { this.tone(160, 55, 0.11, 'square', 0.15); }
  parry(): void { this.tone(920, 1480, 0.16, 'triangle', 0.18); }
  hurt(): void { this.tone(200, 70, 0.22, 'sawtooth', 0.16); }
  pickup(): void { this.tone(540, 880, 0.1, 'sine', 0.1); }
  chest(): void { this.tone(330, 660, 0.2, 'triangle', 0.14); }
}

export const sfx = new SoundFX();

// ─── Foreground Particles & Slash Bursts ─────────────────────────────────────

interface Particle {
  x: number; y: number; vx: number; vy: number;
  color: string; life: number; maxLife: number; size: number; grav: number;
}

interface SlashFX {
  x: number; y: number; flip: boolean; t: number;
}

interface FloatingText {
  x: number; y: number; text: string; color: string; life: number;
}

export class FXManager {
  particles: Particle[] = [];
  slashes: SlashFX[] = [];
  texts: FloatingText[] = [];
  hitStop = 0;

  clear(): void {
    this.particles.length = 0;
    this.slashes.length = 0;
    this.texts.length = 0;
    this.hitStop = 0;
  }

  freeze(sec: number): void {
    this.hitStop = Math.max(this.hitStop, sec);
  }

  burst(x: number, y: number, color: string, count = 10, speed = 90, grav = 260): void {
    for (let i = 0; i < count; i++) {
      const a = randRange(0, Math.PI * 2);
      const s = randRange(speed * 0.3, speed);
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 25,
        color, life: randRange(0.2, 0.45), maxLife: 0.45,
        size: Math.random() < 0.35 ? 2 : 1, grav,
      });
    }
  }

  slash(x: number, y: number, flip: boolean): void {
    this.slashes.push({ x, y, flip, t: 0 });
  }

  popup(x: number, y: number, text: string, color: string = PAL.cream): void {
    this.texts.push({ x, y, text, color, life: 1.1 });
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      s.t += dt;
      if (s.t >= 0.12) this.slashes.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.y -= 14 * dt;
      t.life -= dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    for (const s of this.slashes) {
      drawAnim(ctx, 'fx_slash', s.x - camX, s.y - camY, { time: s.t, flip: s.flip });
    }
    for (const p of this.particles) {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), p.size, p.size);
    }
  }
}

// ─── Autumn Parallax Backdrop + Background Falling Maple Leaves ──────────────

interface Leaf {
  x: number; y: number; vx: number; vy: number; phase: number; color: string; size: number;
}

export class AutumnBackdrop {
  private leaves: Leaf[] = [];
  private time = 0;

  constructor(count = 42) {
    for (let i = 0; i < count; i++) {
      this.leaves.push({
        x: Math.random() * VIEW_W,
        y: Math.random() * VIEW_H,
        vx: -randRange(10, 28),
        vy: randRange(12, 26),
        phase: Math.random() * Math.PI * 2,
        color: LEAF_COLORS[i % LEAF_COLORS.length],
        size: i % 3 === 0 ? 2 : 1,
      });
    }
  }

  update(dt: number): void {
    this.time += dt;
    const gust = Math.sin(this.time * 0.7) * 12;
    for (const l of this.leaves) {
      l.x += (l.vx + gust + Math.sin(this.time * 3 + l.phase) * 10) * dt;
      l.y += (l.vy + Math.cos(this.time * 2.3 + l.phase) * 4) * dt;
      if (l.x < -4) l.x += VIEW_W + 8;
      if (l.x > VIEW_W + 4) l.x -= VIEW_W + 8;
      if (l.y > VIEW_H + 4) {
        l.y = -4;
        l.x = Math.random() * VIEW_W;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, theme: RoomTheme = 'estate'): void {
    drawRoomBackground(ctx, theme, camX, this.leaves, this.time);
  }
}
