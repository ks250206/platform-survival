import { EMPTY_INPUT, type InputFrame } from "./types";
import { screenToWorldMovement } from "./coordinates";

export type InputAction = "jump" | "weak" | "strong" | "roll" | "throw";
const bindings: Record<string, InputAction> = {
  Space: "jump",
  KeyJ: "weak",
  KeyK: "strong",
  ShiftLeft: "roll",
  ShiftRight: "roll",
  KeyE: "throw",
};
const movement = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowLeft",
  "ArrowDown",
  "ArrowRight",
]);

/** Turns held movement and edge-triggered actions into one simulation input. */
export class GameInput {
  private keys = new Set<string>();
  private queued = new Set<InputAction>();
  private stick = { x: 0, y: 0 };
  private gamepadButtons = new Set<number>();
  private onPause: () => void;
  private onRestart: () => void;
  private onGesture: () => void;

  constructor(onPause: () => void, onRestart: () => void, onGesture: () => void) {
    this.onPause = onPause;
    this.onRestart = onRestart;
    this.onGesture = onGesture;
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    window.addEventListener("blur", this.clear);
  }

  private keyDown = (event: KeyboardEvent) => {
    const el = event.target as HTMLElement | null;
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      el?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')
    )
      return;
    if ((event.code === "Space" || event.code === "Enter") && el?.closest("button, a, summary"))
      return;
    if (movement.has(event.code) || bindings[event.code]) event.preventDefault();
    this.keys.add(event.code);
    if (event.repeat) return;
    this.onGesture();
    if (bindings[event.code]) this.queued.add(bindings[event.code]);
    if (event.code === "Escape") this.onPause();
    if (event.code === "KeyR") this.onRestart();
  };

  private keyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };
  clear = () => {
    this.keys.clear();
    this.queued.clear();
    this.stick = { x: 0, y: 0 };
    this.gamepadButtons.clear();
  };
  action(action: InputAction) {
    this.queued.add(action);
    this.onGesture();
  }
  move(x: number, y: number) {
    this.stick = { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
  }

  sample(): InputFrame {
    const modalOpen = Boolean(document.querySelector('[role="dialog"]'));
    let x =
      Number(this.keys.has("KeyD") || this.keys.has("ArrowRight")) -
      Number(this.keys.has("KeyA") || this.keys.has("ArrowLeft")) +
      this.stick.x;
    let y =
      Number(this.keys.has("KeyS") || this.keys.has("ArrowDown")) -
      Number(this.keys.has("KeyW") || this.keys.has("ArrowUp")) +
      this.stick.y;
    const pad = navigator.getGamepads?.().find((p) => p?.connected);
    if (pad) {
      const deadZone = (n: number) =>
        Number.isFinite(n) && Math.abs(n) > 0.18 ? ((Math.abs(n) - 0.18) / 0.82) * Math.sign(n) : 0;
      x += deadZone(pad.axes[0] ?? 0);
      y += deadZone(pad.axes[1] ?? 0);
      x += Number(Boolean(pad.buttons[15]?.pressed)) - Number(Boolean(pad.buttons[14]?.pressed));
      y += Number(Boolean(pad.buttons[13]?.pressed)) - Number(Boolean(pad.buttons[12]?.pressed));
      const actions: Record<number, InputAction> = {
        0: "jump",
        1: "roll",
        2: "weak",
        3: "strong",
        5: "throw",
      };
      for (const [index, action] of Object.entries(actions)) {
        const i = Number(index);
        if (!modalOpen && pad.buttons[i]?.pressed && !this.gamepadButtons.has(i))
          this.queued.add(action);
      }
      if (!modalOpen && pad.buttons[9]?.pressed && !this.gamepadButtons.has(9)) this.onPause();
      this.gamepadButtons = new Set(
        pad.buttons.map((b, i) => (b.pressed ? i : -1)).filter((i) => i >= 0),
      );
    } else this.gamepadButtons.clear();
    if (modalOpen) {
      this.queued.clear();
      return { ...EMPTY_INPUT };
    }
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    const world = screenToWorldMovement(x, y);
    const result: InputFrame = { ...EMPTY_INPUT, moveX: world.x, moveZ: world.z };
    for (const action of this.queued) result[action] = true;
    this.queued.clear();
    return result;
  }

  destroy() {
    window.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
    window.removeEventListener("blur", this.clear);
    this.clear();
  }
}
