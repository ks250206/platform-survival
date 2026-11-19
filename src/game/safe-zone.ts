import { TILE_SIZE } from "./types";
import type { Fighter, GameState, SafeZone, StageState } from "./types";

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

export function createSafeZone(stage: StageState): SafeZone | null {
  if (stage.groundMode !== "safe-zone") return null;
  const arenaHalfSize = (stage.gridRadius + 0.5) * TILE_SIZE;
  const radius = Math.SQRT2 * arenaHalfSize + 0.5;
  return {
    x: 0,
    z: 0,
    radius,
    fromX: 0,
    fromZ: 0,
    fromRadius: radius,
    targetX: 0,
    targetZ: 0,
    targetRadius: radius,
    phase: "holding",
    timer: 8,
    duration: 8,
    wave: 0,
    outsideLimit: 4,
    arenaHalfSize,
    speedMultiplier: stage.speedMultiplier,
  };
}

function prepareNextZone(zone: SafeZone, seed: number): void {
  zone.wave++;
  const random =
    (Math.imul((seed >>> 0) ^ Math.imul(zone.wave, 0x45d9f3b), 1664525) + 1013904223) >>> 0;
  const angle = (random / 0x100000000) * Math.PI * 2;
  zone.targetRadius = Math.max(2.6, 8.8 - (zone.wave - 1) * 0.75);
  const limit = Math.max(0, zone.arenaHalfSize - zone.targetRadius - 0.6);
  const travel = zone.wave === 1 ? 3 : 3.8;
  zone.targetX = clamp(zone.x + Math.cos(angle) * travel, -limit, limit);
  zone.targetZ = clamp(zone.z + Math.sin(angle) * travel, -limit, limit);
  zone.phase = "warning";
  zone.duration = 4;
  zone.timer = zone.duration;
}

/** Returns eliminations; the engine remains responsible for placements and events. */
export function updateSafeZone(state: GameState, dt: number): number[] {
  const zone = state.safeZone;
  if (!zone || state.phase !== "playing" || !Number.isFinite(dt) || dt <= 0) return [];
  let remaining = Math.min(dt, 0.1);
  while (remaining > 0.000001) {
    const step = Math.min(remaining, zone.timer);
    zone.timer = Math.max(0, zone.timer - step);
    remaining -= step;
    if (zone.phase === "moving") {
      const progress = clamp(1 - zone.timer / zone.duration, 0, 1);
      zone.x = zone.fromX + (zone.targetX - zone.fromX) * progress;
      zone.z = zone.fromZ + (zone.targetZ - zone.fromZ) * progress;
      zone.radius = zone.fromRadius + (zone.targetRadius - zone.fromRadius) * progress;
    }
    if (zone.timer > 0.000001) continue;
    if (zone.phase === "holding")
      prepareNextZone(zone, state.options.seed ^ Math.imul(state.series.round, 0x9e3779b1));
    else if (zone.phase === "warning") {
      zone.fromX = zone.x;
      zone.fromZ = zone.z;
      zone.fromRadius = zone.radius;
      zone.phase = "moving";
      zone.duration = Math.max(4.8, 6 / zone.speedMultiplier);
      zone.timer = zone.duration;
    } else {
      zone.x = zone.targetX;
      zone.z = zone.targetZ;
      zone.radius = zone.targetRadius;
      zone.phase = "holding";
      zone.duration = Math.max(5.5, 8 / zone.speedMultiplier);
      zone.timer = zone.duration;
    }
  }
  const eliminated: number[] = [];
  for (const fighter of state.fighters) {
    if (!fighter.alive) continue;
    if (Math.hypot(fighter.x - zone.x, fighter.z - zone.z) > zone.radius) {
      fighter.outsideZoneTime += Math.min(dt, 0.1);
      if (fighter.outsideZoneTime + 1e-8 >= zone.outsideLimit) eliminated.push(fighter.id);
    } else fighter.outsideZoneTime = 0;
  }
  return eliminated;
}

/** Steer to the next circle during its warning; leave room from its boundary. */
export function safeZoneNavigationTarget(
  state: GameState,
  fighter: Fighter,
): { x: number; z: number } | null {
  const zone = state.safeZone;
  if (!zone) return null;
  const anticipating = zone.phase === "warning" || zone.phase === "moving";
  const x = anticipating ? zone.targetX : zone.x;
  const z = anticipating ? zone.targetZ : zone.z;
  const radius = anticipating ? zone.targetRadius : zone.radius;
  const dx = fighter.x - x;
  const dz = fighter.z - z;
  const distance = Math.hypot(dx, dz);
  const currentDistance = Math.hypot(fighter.x - zone.x, fighter.z - zone.z);
  if (distance < Math.max(0.4, radius - 1.4) && currentDistance < zone.radius - 0.5) return null;
  const landingRadius = Math.max(0, radius - 2.1);
  const scale = distance > 0.0001 ? landingRadius / distance : 0;
  const destination = { x: x + dx * scale, z: z + dz * scale };
  if (anticipating) {
    // A forecast is not safe yet. Leave enough margin in the active circle for
    // navigation to round this staging point to a supported tile center.
    const offsetX = destination.x - zone.x;
    const offsetZ = destination.z - zone.z;
    const distanceFromCurrent = Math.hypot(offsetX, offsetZ);
    const currentInterior = Math.max(0, zone.radius - Math.min(1.4, zone.radius * 0.5));
    if (distanceFromCurrent > currentInterior && distanceFromCurrent > 0.0001) {
      destination.x = zone.x + (offsetX * currentInterior) / distanceFromCurrent;
      destination.z = zone.z + (offsetZ * currentInterior) / distanceFromCurrent;
    }
  }
  return destination;
}
