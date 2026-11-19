import { describe, expect, it } from "vite-plus/test";
import {
  ATTACKS,
  attackIsActive,
  knockbackSpeed,
  ROLL_COST,
  ROLL_DURATION,
} from "../src/game/combat";
import { GameEngine } from "../src/game/engine";
import { DEFAULT_OPTIONS, EMPTY_INPUT, GRID_RADIUS, TILE_SIZE } from "../src/game/types";
import type { InputFrame, Projectile } from "../src/game/types";

const tick = 1 / 60;

function advance(engine: GameEngine, seconds: number, input: InputFrame = EMPTY_INPUT): void {
  const frames = Math.ceil(seconds / tick);
  for (let i = 0; i < frames; i++) engine.step(input, tick);
}

function isolated(): GameEngine {
  const engine = new GameEngine({ playerCount: 4, seed: 112 });
  engine.state.phase = "playing";
  engine.state.bumpers = [];
  engine.state.pickups = [];
  engine.state.tiles.forEach((tile) => {
    tile.kind = "normal";
  });
  const [player, target, ...others] = engine.state.fighters;
  Object.assign(player, { x: 4, y: 0, z: 4, facing: 0 });
  Object.assign(target, {
    x: 4,
    y: 0,
    z: 5.3,
    facing: Math.PI,
    aiTimer: Infinity,
    action: "hurt",
    actionDuration: 10000,
  });
  others.forEach((fighter) => {
    fighter.alive = false;
    fighter.placement = 4;
  });
  return engine;
}

function ball(id: number, x: number, z: number, vx = 0, vz = 0): Projectile {
  return {
    id,
    x,
    y: 0.65,
    z,
    vx,
    vy: 0,
    vz,
    ownerId: null,
    color: 0xffffff,
    radius: 0.24,
    ttl: 6,
    reflections: 0,
    immunity: 0,
  };
}

describe("round lifecycle and deterministic world", () => {
  it("spawns 24 separated fighters by default, with one human and 23 CPUs", () => {
    const engine = new GameEngine();
    expect(DEFAULT_OPTIONS.playerCount).toBe(24);
    expect(engine.state.fighters).toHaveLength(24);
    expect(engine.state.fighters.filter((fighter) => fighter.isPlayer)).toHaveLength(1);
    expect(Math.hypot(engine.state.fighters[0].x, engine.state.fighters[0].z)).toBeLessThan(5);
    expect(engine.state.tiles).toHaveLength((GRID_RADIUS * 2 + 1) ** 2);
    for (const fighter of engine.state.fighters) {
      expect(engine.tileAt(fighter.x, fighter.z)).toBeDefined();
      expect(fighter.name).toBeTruthy();
      for (const other of engine.state.fighters) {
        if (other.id !== fighter.id)
          expect(Math.hypot(fighter.x - other.x, fighter.z - other.z)).toBeGreaterThan(1.2);
      }
    }
  });

  it("requires the countdown before time and combat advance", () => {
    const engine = new GameEngine();
    engine.start();
    advance(engine, 2.5, { ...EMPTY_INPUT, strong: true });
    expect(engine.state.phase).toBe("countdown");
    expect(engine.state.elapsed).toBe(0);
    expect(engine.state.fighters[0].stamina).toBe(100);
    advance(engine, 0.6);
    expect(engine.state.phase).toBe("playing");
    expect(engine.state.elapsed).toBeGreaterThan(0);
  });

  it("freezes physics, projectiles, timers and events while paused and resumes countdown", () => {
    const engine = new GameEngine();
    engine.start();
    advance(engine, 0.4);
    engine.setPaused(true);
    const before = JSON.stringify(engine.state);
    advance(engine, 5, { ...EMPTY_INPUT, jump: true, moveX: 1 });
    expect(JSON.stringify(engine.state)).toBe(before);
    engine.setPaused(false);
    expect(engine.state.phase).toBe("countdown");
    advance(engine, 3);
    expect(engine.state.phase).toBe("playing");
  });

  it("replaying a seed reconstructs identical gameplay", () => {
    const engine = new GameEngine({ seed: 99 });
    engine.start();
    advance(engine, 8);
    const first = JSON.stringify(engine.state);
    engine.reset();
    expect(engine.state.phase).toBe("lobby");
    engine.start();
    advance(engine, 8);
    expect(JSON.stringify(engine.state)).toBe(first);
  });

  it("awards the surviving fighter a win and records elimination credit", () => {
    const engine = isolated();
    const [player, target] = engine.state.fighters;
    target.y = -8;
    target.lastHitBy = player.id;
    target.lastHitTime = 0;
    engine.step(EMPTY_INPUT, tick);
    expect(target.alive).toBe(false);
    expect(target.placement).toBe(2);
    expect(player.kills).toBe(1);
    expect(player.placement).toBe(1);
    expect(engine.state.winnerId).toBe(player.id);
    expect(engine.state.phase).toBe("finished");
  });

  it("records a draw if the final two fighters fall on the same tick", () => {
    const engine = isolated();
    engine.state.fighters[0].y = -8;
    engine.state.fighters[1].y = -8;
    engine.step(EMPTY_INPUT, tick);
    expect(engine.state.phase).toBe("finished");
    expect(engine.state.winnerId).toBeNull();
  });
});

describe("movement, stamina and damage", () => {
  it("has no air jump and does not consume stamina for a grounded jump", () => {
    const engine = isolated();
    const player = engine.state.fighters[0];
    engine.step({ ...EMPTY_INPUT, jump: true }, tick);
    expect(player.grounded).toBe(false);
    expect(player.stamina).toBe(100);
    advance(engine, 0.1);
    const previousVelocity = player.vy;
    engine.step({ ...EMPTY_INPUT, jump: true }, tick);
    expect(player.vy).toBeLessThan(previousVelocity);
    expect(player.y).toBeGreaterThan(0);
  });

  it("charges stamina once, refuses unaffordable rolls and delays regeneration", () => {
    const engine = isolated();
    const player = engine.state.fighters[0];
    player.stamina = 20;
    engine.step({ ...EMPTY_INPUT, roll: true }, tick);
    expect(player.action).toBe("idle");
    engine.step(EMPTY_INPUT, tick);
    player.stamina = 100;
    engine.step({ ...EMPTY_INPUT, roll: true }, tick);
    expect(player.stamina).toBe(100 - ROLL_COST);
    advance(engine, 0.25, { ...EMPTY_INPUT, roll: true });
    expect(player.stamina).toBe(100 - ROLL_COST);
    expect(player.action).toBe("roll");
    advance(engine, 0.7);
    expect(player.stamina).toBeGreaterThan(100 - ROLL_COST);
  });

  it("roll invulnerability ends before its recovery animation", () => {
    const engine = isolated();
    const player = engine.state.fighters[0];
    engine.step({ ...EMPTY_INPUT, roll: true }, tick);
    engine.state.projectiles.push(ball(100, player.x, player.z));
    engine.step(EMPTY_INPUT, tick);
    expect(player.damage).toBe(0);
    advance(engine, 0.28);
    expect(player.action).toBe("roll");
    expect(player.actionTime).toBeLessThan(ROLL_DURATION);
    expect(player.invulnerable).toBe(0);
    engine.state.projectiles = [ball(101, player.x, player.z)];
    engine.step(EMPTY_INPUT, tick);
    expect(player.damage).toBe(12);
    expect(player.action).toBe("hurt");
  });

  it("accumulated damage increases launch velocity and never removes health", () => {
    expect(knockbackSpeed(6, 100)).toBeGreaterThan(knockbackSpeed(6, 0) * 1.8);
    const velocities: number[] = [];
    for (const initialDamage of [0, 100]) {
      const engine = isolated();
      const target = engine.state.fighters[1];
      target.damage = initialDamage;
      engine.step({ ...EMPTY_INPUT, strong: true }, tick);
      advance(engine, ATTACKS.strong.windup);
      velocities.push(Math.hypot(target.vx, target.vz));
      expect(target.damage).toBe(initialDamage + ATTACKS.strong.damage);
      expect(target.alive).toBe(true);
    }
    expect(velocities[1]).toBeGreaterThan(velocities[0] * 1.7);
  });

  it("a tail spin has windup, hits behind the fighter and hits each target once", () => {
    const engine = isolated();
    const [player, target] = engine.state.fighters;
    target.z = 2.7;
    engine.step({ ...EMPTY_INPUT, strong: true }, tick);
    advance(engine, 0.1);
    expect(target.damage).toBe(0);
    for (let i = 0; i < 35; i++) {
      Object.assign(target, {
        x: player.x,
        z: player.z - 1.3,
        y: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        grounded: true,
        invulnerable: 0,
      });
      engine.step(EMPTY_INPUT, tick);
    }
    expect(target.damage).toBe(ATTACKS.strong.damage);
    expect(player.stamina).toBe(75);
    expect(player.hitTargets).toContain(target.id);
  });

  it("an airborne attack selects the aerial move instead of ground strong attack", () => {
    const engine = isolated();
    const player = engine.state.fighters[0];
    engine.step({ ...EMPTY_INPUT, jump: true }, tick);
    engine.step(EMPTY_INPUT, tick);
    engine.step({ ...EMPTY_INPUT, strong: true }, tick);
    expect(player.action).toBe("air");
    expect(player.stamina).toBe(90);
  });
});

describe("items and shrinking arena", () => {
  it("reflects during active tail frames, transfers ownership and accelerates the item", () => {
    const engine = isolated();
    const player = engine.state.fighters[0];
    engine.step({ ...EMPTY_INPUT, strong: true }, tick);
    advance(engine, 0.2);
    expect(attackIsActive(player)).toBe(true);
    engine.state.projectiles = [ball(120, player.x + 1, player.z, -5, 0)];
    engine.step(EMPTY_INPUT, tick);
    const reflected = engine.state.projectiles[0];
    expect(reflected.ownerId).toBe(player.id);
    expect(reflected.reflections).toBe(1);
    expect(Math.hypot(reflected.vx, reflected.vz)).toBeGreaterThan(5);
    expect(player.reflections).toBe(1);
    reflected.x = player.x;
    reflected.z = player.z;
    reflected.immunity = 0;
    engine.step(EMPTY_INPUT, tick);
    expect(reflected.reflections).toBe(1);
  });

  it("tail windup does not reflect an item through the body", () => {
    const engine = isolated();
    const player = engine.state.fighters[0];
    engine.step({ ...EMPTY_INPUT, strong: true }, tick);
    engine.state.projectiles = [ball(121, player.x, player.z)];
    engine.step(EMPTY_INPUT, tick);
    expect(player.damage).toBe(12);
    expect(player.reflections).toBe(0);
  });

  it("a held item can be thrown once and cannot damage its owner", () => {
    const engine = isolated();
    const player = engine.state.fighters[0];
    player.item = true;
    engine.state.fighters[1].x = -4;
    engine.step({ ...EMPTY_INPUT, throw: true }, tick);
    expect(player.item).toBe(false);
    expect(engine.state.projectiles).toHaveLength(1);
    expect(engine.state.projectiles[0].ownerId).toBe(player.id);
    advance(engine, 0.2, { ...EMPTY_INPUT, throw: true });
    expect(player.damage).toBe(0);
    expect(engine.state.projectiles.length).toBeLessThanOrEqual(1);
  });

  it("warns before collapse, removes floor support and never clamps fighters to the edge", () => {
    const engine = isolated();
    const player = engine.state.fighters[0];
    engine.state.elapsed = 25;
    engine.step(EMPTY_INPUT, tick);
    expect(engine.state.warning).toBe(true);
    expect(
      engine.state.tiles
        .filter((tile) => tile.ring === GRID_RADIUS)
        .every((tile) => tile.state === "warning"),
    ).toBe(true);
    expect(engine.tileAt(GRID_RADIUS * TILE_SIZE, 0)).toBeDefined();
    player.x = GRID_RADIUS * TILE_SIZE;
    player.z = 3.5;
    engine.state.elapsed = 29.99;
    engine.step(EMPTY_INPUT, tick);
    expect(engine.state.safeRing).toBe(GRID_RADIUS - 1);
    expect(engine.tileAt(player.x, player.z)).toBeUndefined();
    expect(player.grounded).toBe(false);
    advance(engine, 0.3);
    expect(player.y).toBeLessThan(0);
    expect(player.x).toBeGreaterThan((GRID_RADIUS - 0.5) * TILE_SIZE);
  });

  it("collapses the last center tile at155 seconds so rounds cannot stall forever", () => {
    const engine = isolated();
    engine.state.elapsed = 154.99;
    engine.step(EMPTY_INPUT, tick);
    expect(engine.state.safeRing).toBe(-1);
    expect(engine.tileAt(0, 0)).toBeUndefined();
    advance(engine, 2);
    expect(engine.state.phase).toBe("finished");
  });

  it("finishes a seeded 24-fighter CPU simulation without invalid coordinates", () => {
    const engine = new GameEngine({ seed: 417 });
    engine.start();
    engine.state.fighters[0].isPlayer = false;
    for (let frame = 0; frame < 160 * 60 && engine.state.phase !== "finished"; frame++) {
      engine.step(EMPTY_INPUT, tick);
    }
    expect(engine.state.phase).toBe("finished");
    expect(engine.state.elapsed).toBeLessThan(158);
    for (const fighter of engine.state.fighters) {
      expect(
        Number.isFinite(fighter.x + fighter.y + fighter.z + fighter.stamina + fighter.damage),
      ).toBe(true);
      expect(fighter.stamina).toBeGreaterThanOrEqual(0);
      expect(fighter.stamina).toBeLessThanOrEqual(100);
    }
    expect(engine.state.fighters.filter((fighter) => fighter.alive).length).toBeLessThanOrEqual(1);
  });
});
