export type Action =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'jump'
  | 'attack'
  | 'dash'
  | 'parry'
  | 'confirm'
  | 'restart'
  | 'newSeed'
  | 'debug'
  | 'mute';

/** Keyboard bindings. Edit freely. Uses KeyboardEvent.code (layout independent). */
export const BINDINGS: Record<Action, string[]> = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['Space', 'KeyW', 'ArrowUp'],
  attack: ['KeyJ', 'KeyX'],
  dash: ['KeyK', 'ShiftLeft', 'ShiftRight', 'KeyC'],
  parry: ['KeyL', 'KeyZ'],
  confirm: ['Enter', 'NumpadEnter'],
  restart: ['KeyR'],
  newSeed: ['KeyN'],
  debug: ['KeyI', 'Backquote', 'F3'],
  mute: ['KeyM'],
};

const PREVENT_DEFAULT = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'F3', 'Tab']);

export class Input {
  private held = new Set<string>();
  private pressed = new Set<string>();
  private anyKeyListeners: Array<() => void> = [];

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
      if (!this.held.has(e.code)) this.pressed.add(e.code);
      this.held.add(e.code);
      if (!BINDINGS.debug.includes(e.code) && !BINDINGS.mute.includes(e.code)) {
        for (const fn of this.anyKeyListeners) fn();
      }
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
  }

  onAnyKey(fn: () => void): void {
    this.anyKeyListeners.push(fn);
  }

  isDown(a: Action): boolean {
    return BINDINGS[a].some((c) => this.held.has(c));
  }

  wasPressed(a: Action): boolean {
    return BINDINGS[a].some((c) => this.pressed.has(c));
  }

  /** Call after a fixed update step has consumed this frame's presses. */
  endFrame(): void {
    this.pressed.clear();
  }
}
