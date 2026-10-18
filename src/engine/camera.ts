import { VIEW_W, VIEW_H } from '../config';
import { clamp } from './math';

export class Camera {
  x = 0;
  y = 0;
  private ox = 0;
  private oy = 0;
  private shakeMag = 0;
  private shakeTime = 0;

  follow(tx: number, ty: number, worldW: number, worldH: number, dt: number): void {
    const k = 1 - Math.exp(-dt * 7);
    this.x += (tx - VIEW_W / 2 - this.x) * k;
    // Keep vertical camera locked in standard single-screen rooms so jumping doesn't bounce the horizon
    if (worldH <= VIEW_H + 16) {
      this.y = Math.max(0, worldH - VIEW_H);
    } else {
      this.y += (ty - VIEW_H / 2 - this.y) * k;
    }
    this.clampTo(worldW, worldH);
  }

  snap(tx: number, ty: number, worldW: number, worldH: number): void {
    this.x = tx - VIEW_W / 2;
    this.y = worldH <= VIEW_H + 16 ? Math.max(0, worldH - VIEW_H) : ty - VIEW_H / 2;
    this.clampTo(worldW, worldH);
  }

  private clampTo(worldW: number, worldH: number): void {
    this.x = clamp(this.x, 0, Math.max(0, worldW - VIEW_W));
    this.y = clamp(this.y, 0, Math.max(0, worldH - VIEW_H));
  }

  shake(mag: number, dur: number): void {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeTime = Math.max(this.shakeTime, dur);
  }

  update(dt: number): void {
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const m = this.shakeMag * clamp(this.shakeTime * 6, 0, 1);
      this.ox = (Math.random() * 2 - 1) * m;
      this.oy = (Math.random() * 2 - 1) * m;
      if (this.shakeTime <= 0) {
        this.shakeMag = 0;
        this.ox = this.oy = 0;
      }
    }
  }

  /** Integer camera position (including shake) — always render foreground with these. */
  get viewX(): number {
    return Math.round(this.x + this.ox);
  }
  get viewY(): number {
    return Math.round(this.y + this.oy);
  }
  /** Shake-free horizontal camera position for distant mountains & forest backgrounds. */
  get bgX(): number {
    return Math.round(this.x);
  }
}
