import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { GameInput } from "../src/game/input";
import { EMPTY_INPUT } from "../src/game/types";
import { screenToWorldMovement } from "../src/game/coordinates";

describe("input boundaries", () => {
  let input: GameInput;
  let listeners: Map<string, (event: unknown) => void>;
  let pads: unknown[];
  let modal: boolean;
  let modalTitle: string;
  const pause = vi.fn();
  const restart = vi.fn();

  beforeEach(() => {
    pads = [];
    modal = false;
    modalTitle = "遊び方";
    listeners = new Map();
    pause.mockReset();
    restart.mockReset();
    vi.stubGlobal("window", {
      addEventListener: (type: string, listener: (event: unknown) => void) =>
        listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    });
    vi.stubGlobal("document", {
      querySelector: () => (modal ? { getAttribute: () => modalTitle } : null),
    });
    vi.stubGlobal("navigator", { getGamepads: () => pads });
    input = new GameInput(pause, restart, vi.fn());
  });
  afterEach(() => {
    input.destroy();
    vi.unstubAllGlobals();
  });

  function key(
    code: string,
    target: { closest: (selector: string) => unknown } = { closest: () => null },
  ) {
    const event = { code, target, repeat: false, preventDefault: vi.fn() };
    listeners.get("keydown")!(event);
    return event;
  }

  it("keeps movement finite with a short nonstandard gamepad and invalid axes", () => {
    pads = [{ connected: true, axes: [NaN, 0], buttons: [] }];
    expect(input.sample()).toEqual(EMPTY_INPUT);
    input.move(Infinity, NaN);
    expect(input.sample()).toEqual(EMPTY_INPUT);
  });

  it("preserves native Space activation on buttons while allowing movement after resume", () => {
    const button = {
      closest: (selector: string) => (selector === "button, a, summary" ? {} : null),
    };
    expect(key("Space", button).preventDefault).not.toHaveBeenCalled();
    expect(input.sample().jump).toBe(false);
    key("KeyW", button);
    expect(input.sample().moveZ).toBeLessThan(0);
  });

  it("does not restart or attack behind an open dialog", () => {
    const dialog = { closest: () => ({}) };
    key("KeyR", dialog);
    expect(restart).not.toHaveBeenCalled();
    modal = true;
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
    buttons[3].pressed = true;
    buttons[9].pressed = true;
    pads = [{ connected: true, axes: [1, 1], buttons }];
    expect(input.sample()).toEqual(EMPTY_INPUT);
    expect(pause).not.toHaveBeenCalled();
    modal = false;
    expect(input.sample().strong).toBe(false);
  });

  it("normalizes diagonals and clears held keys on focus loss", () => {
    key("KeyW");
    key("KeyD");
    const frame = input.sample();
    expect(Math.hypot(frame.moveX, frame.moveZ)).toBeCloseTo(1);
    listeners.get("blur")!({});
    expect(input.sample()).toEqual(EMPTY_INPUT);
  });

  it("allows gamepad Start to resume the pause dialog while retaining other modal guards", () => {
    modal = true;
    modalTitle = "一時停止";
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
    buttons[9]!.pressed = true;
    buttons[3]!.pressed = true;
    pads = [{ connected: true, axes: [0, 0], buttons }];
    expect(input.sample()).toEqual(EMPTY_INPUT);
    expect(pause).toHaveBeenCalledTimes(1);
    input.sample();
    expect(pause).toHaveBeenCalledTimes(1);
    buttons[9]!.pressed = false;
    input.sample();
    modalTitle = "遊び方";
    buttons[9]!.pressed = true;
    input.sample();
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("turns each press into one action while retaining movement", () => {
    key("KeyW");
    key("KeyK");
    expect(input.sample().strong).toBe(true);
    expect(input.sample().strong).toBe(false);
    expect(input.sample().moveZ).toBeLessThan(0);
  });

  it("uses an orthonormal camera-relative movement transform", () => {
    const up = screenToWorldMovement(0, -1);
    const right = screenToWorldMovement(1, 0);
    expect(up.x * right.x + up.z * right.z).toBeCloseTo(0);
    expect(Math.hypot(up.x, up.z)).toBeCloseTo(1);
  });
});
