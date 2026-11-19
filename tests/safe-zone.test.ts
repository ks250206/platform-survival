import { describe, expect, it } from "vite-plus/test";
import { GameEngine } from "../src/game/engine";
import { safeZoneNavigationTarget, updateSafeZone } from "../src/game/safe-zone";
import type { GameState } from "../src/game/types";

function fixture() {
  const engine = new GameEngine({ stage: "safezone", mode: "single", seed: 817 });
  engine.state.phase = "playing";
  return engine.state;
}
function advance(state: GameState, seconds: number) {
  const ids = new Set<number>();
  for (let i = 0; i < Math.ceil(seconds * 60); i++) {
    for (const id of updateSafeZone(state, 1 / 60)) ids.add(id);
  }
  return ids;
}

describe("moving safe zone", () => {
  it("starts with the entire platform safe and warns before moving", () => {
    const state = fixture();
    const zone = state.safeZone!;
    expect(state.tiles.every((tile) => Math.hypot(tile.x, tile.z) < zone.radius)).toBe(true);
    const initialRadius = zone.radius;
    advance(state, 8.05);
    expect(zone.phase).toBe("warning");
    expect(zone.radius).toBe(initialRadius);
    expect(zone.targetRadius).toBeLessThan(zone.radius);
    const next = { x: zone.targetX, z: zone.targetZ, radius: zone.targetRadius };
    advance(state, 3);
    expect(zone.phase).toBe("warning");
    expect({ x: zone.targetX, z: zone.targetZ, radius: zone.targetRadius }).toEqual(next);
    advance(state, 2);
    expect(zone.phase).toBe("moving");
    expect(zone.radius).toBeLessThan(initialRadius);
    expect(zone.radius).toBeGreaterThan(zone.targetRadius);
  });
  it("requires4 continuous outside seconds, resets inside, and ignores roll invulnerability", () => {
    const state = fixture();
    const zone = state.safeZone!;
    zone.radius = 3;
    zone.timer = 100;
    const player = state.fighters[0]!;
    player.x = 6;
    player.z = 0;
    player.invulnerable = 100;
    expect(advance(state, 3.5).has(player.id)).toBe(false);
    player.x = 0;
    advance(state, 0.1);
    expect(player.outsideZoneTime).toBe(0);
    player.x = 6;
    expect(advance(state, 3.9).has(player.id)).toBe(false);
    expect(advance(state, 0.12).has(player.id)).toBe(true);
  });
  it("freezes warnings and exposure during pause and countdown", () => {
    const state = fixture();
    state.safeZone!.radius = 1;
    const before = structuredClone(state.safeZone);
    for (const phase of ["paused", "countdown"] as const) {
      state.phase = phase;
      expect(updateSafeZone(state, 0.1)).toEqual([]);
      expect(state.safeZone).toEqual(before);
      expect(state.fighters.every((fighter) => fighter.outsideZoneTime === 0)).toBe(true);
    }
  });
  it("keeps destination circles on the platform and caps shrinking in a long round", () => {
    const state = fixture();
    for (let i = 0; i < 6000; i++) {
      updateSafeZone(state, 0.1);
      const zone = state.safeZone!;
      expect(Math.abs(zone.targetX) + zone.targetRadius).toBeLessThanOrEqual(
        zone.arenaHalfSize + (zone.wave === 0 ? 10 : 0),
      );
      expect(Math.abs(zone.targetZ) + zone.targetRadius).toBeLessThanOrEqual(
        zone.arenaHalfSize + (zone.wave === 0 ? 10 : 0),
      );
      expect(zone.targetRadius).toBeGreaterThanOrEqual(2.6);
    }
  });
  it("gives CPUs an interior destination before the forecast circle starts moving", () => {
    const state = fixture();
    advance(state, 8.1);
    const zone = state.safeZone!;
    const fighter = state.fighters[0]!;
    fighter.x = -12;
    fighter.z = 12;
    const target = safeZoneNavigationTarget(state, fighter)!;
    expect(target).not.toBeNull();
    expect(Math.hypot(target.x - zone.targetX, target.z - zone.targetZ)).toBeLessThan(
      zone.targetRadius - 1,
    );
  });
  it("does not send a CPU into the future circle before that circle becomes safe", () => {
    const state = fixture();
    const zone = state.safeZone!;
    Object.assign(zone, {
      x: 0,
      z: 0,
      radius: 2.6,
      targetX: 3.8,
      targetZ: 0,
      targetRadius: 2.6,
      phase: "warning",
      timer: 4,
      duration: 4,
      wave: 9,
    });
    const fighter = state.fighters[0]!;
    fighter.x = 0.8;
    fighter.z = 2.4;
    for (let frame = 0; frame < 12 * 60; frame++) {
      const target = safeZoneNavigationTarget(state, fighter);
      if (target) {
        const dx = target.x - fighter.x;
        const dz = target.z - fighter.z;
        const length = Math.hypot(dx, dz);
        const amount = length > 0 ? Math.min(1, 4.8 / 60 / length) : 0;
        fighter.x += dx * amount;
        fighter.z += dz * amount;
      }
      expect(updateSafeZone(state, 1 / 60)).not.toContain(fighter.id);
      if (zone.phase === "warning") expect(fighter.outsideZoneTime).toBe(0);
    }
    expect(Math.hypot(fighter.x - zone.x, fighter.z - zone.z)).toBeLessThan(zone.radius);
  });
});
