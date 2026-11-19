import { describe, expect, it } from "vite-plus/test";
import { GameEngine } from "../src/game/engine";
import { STAGES } from "../src/game/stages";
import { EMPTY_INPUT, TILE_SIZE } from "../src/game/types";
import type { Meteor, StageId } from "../src/game/types";

const dt = 1 / 60;
function advance(engine: GameEngine, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / dt); i++) engine.step(EMPTY_INPUT, dt);
}
function quiet(stage: StageId): GameEngine {
  const engine = new GameEngine({ playerCount: 4, stage, mode: "single", seed: 23 });
  engine.state.phase = "playing";
  for (const fighter of engine.state.fighters) {
    fighter.isPlayer = true; // Neutral input, no CPU decisions in collision fixtures.
    fighter.alive = fighter.id < 2;
  }
  engine.state.pickups = [];
  Object.assign(engine.state.fighters[1]!, { x: -3.6, z: -3.6 });
  return engine;
}
function meteor(overrides: Partial<Meteor> = {}): Meteor {
  return {
    id: 700,
    x: 0,
    z: 0,
    radius: 2.4,
    warningTime: 2.8,
    timeToImpact: 0.1,
    impactAge: 0,
    phase: "warning",
    hitTargets: [],
    ...overrides,
  };
}

describe("stage geometry and hazard lifecycle", () => {
  it("uses actual sparse footprint cells and supported distinct 24-fighter spawns", () => {
    for (const stage of STAGES) {
      const engine = new GameEngine({ stage: stage.id, playerCount: 24, mode: "single" });
      for (const tile of engine.state.tiles)
        expect(engine.tileAt(tile.x, tile.z)?.id).toBe(tile.id);
      for (const fighter of engine.state.fighters) {
        expect(engine.tileAt(fighter.x, fighter.z)).toBeDefined();
        for (const other of engine.state.fighters) {
          if (other.id !== fighter.id)
            expect(Math.hypot(fighter.x - other.x, fighter.z - other.z)).toBeGreaterThan(1.2);
        }
      }
      if (stage.id === "holes") expect(engine.tileAt(0, 0)).toBeUndefined();
      if (stage.id === "hammers") expect(engine.tileAt(7.2, 7.2)).toBeUndefined();
      if (stage.id === "conveyor") expect(engine.tileAt(0, 9)).toBeUndefined();
    }
  });

  it("does not leave an invisible center hub on stages without spinners", () => {
    const engine = quiet("meteors");
    const player = engine.state.fighters[0]!;
    Object.assign(player, { x: 0, z: 0 });
    engine.step(EMPTY_INPUT, dt);
    expect(player.x).toBe(0);
    expect(player.z).toBe(0);
  });

  it("second-spinner collision uses its own orientation and jump height", () => {
    for (const height of [0, 1.2]) {
      const engine = quiet("twin");
      engine.state.bumpers = [];
      const [first, second] = engine.state.spinners;
      first!.angle = Math.PI / 2;
      first!.baseSpeed = 0;
      second!.angle = 0;
      second!.baseSpeed = 0;
      const player = engine.state.fighters[0]!;
      Object.assign(player, { x: 2.4, z: 0, y: height, grounded: height === 0 });
      engine.step(EMPTY_INPUT, dt);
      expect(player.damage).toBe(height === 0 ? 7 : 0);
    }
  });

  it("hammer hits use the visible pendulum head position", () => {
    const engine = quiet("hammers");
    const hammer = engine.state.hammers[0]!;
    hammer.phase = 0;
    hammer.speed = 0;
    const player = engine.state.fighters[0]!;
    Object.assign(player, { x: hammer.pivot.x, z: hammer.pivot.z + 0.65 });
    engine.step(EMPTY_INPUT, dt);
    expect(hammer.x).toBe(hammer.pivot.x);
    expect(hammer.z).toBe(hammer.pivot.z);
    expect(hammer.y).toBeCloseTo(hammer.pivot.y - hammer.length);
    expect(player.damage).toBe(16);
  });

  it("retires anchor-dependent hazards when their floor collapses", () => {
    const engine = quiet("holes");
    engine.state.elapsed = 80;
    engine.step(EMPTY_INPUT, dt);
    expect(engine.state.safeRing).toBe(2);
    expect(engine.state.hammers).toHaveLength(0);
    const sky = quiet("sky");
    sky.state.elapsed = 155;
    sky.step(EMPTY_INPUT, dt);
    expect(sky.state.spinners).toHaveLength(0);
    expect(sky.state.bumpers).toHaveLength(0);
    expect(sky.state.spinnerRadius).toBe(0);
  });

  it("freezes every hazard during countdown and pause", () => {
    const engine = new GameEngine({ stage: "chaos", playerCount: 4 });
    engine.start();
    const hazardSnapshot = () =>
      JSON.stringify({
        spinners: engine.state.spinners,
        hammers: engine.state.hammers,
        tiles: engine.state.tiles,
        meteors: engine.state.meteors,
        zone: engine.state.safeZone,
      });
    const before = hazardSnapshot();
    advance(engine, 1);
    expect(hazardSnapshot()).toBe(before);
    engine.setPaused(true);
    advance(engine, 5);
    expect(hazardSnapshot()).toBe(before);
  });
});

describe("temporary floors and reversing conveyors", () => {
  it("warns while supporting feet, opens, restores, and never catches a fighter underneath", () => {
    const engine = quiet("holes");
    engine.state.hammers = [];
    const tile = engine.state.tiles.find((candidate) => candidate.trap?.group === 0)!;
    engine.state.elapsed = 8;
    engine.step(EMPTY_INPUT, dt);
    expect(tile.trap?.phase).toBe("warning");
    expect(engine.tileAt(tile.x, tile.z)).toBe(tile);
    const player = engine.state.fighters[0]!;
    Object.assign(player, { x: tile.x, z: tile.z, y: 0, grounded: true });
    engine.state.elapsed = 10.4;
    engine.step(EMPTY_INPUT, dt);
    expect(tile.trap?.phase).toBe("open");
    expect(engine.tileAt(tile.x, tile.z)).toBeUndefined();
    expect(player.grounded).toBe(false);
    advance(engine, 0.2);
    expect(player.y).toBeLessThan(0);
    engine.state.elapsed = 13.6;
    engine.step(EMPTY_INPUT, dt);
    expect(tile.trap?.phase).toBe("closed");
    expect(engine.tileAt(tile.x, tile.z)).toBe(tile);
    expect(player.y).toBeLessThan(0);
    expect(player.grounded).toBe(false);
  });

  it("permanently collapsed trap tiles never restore support", () => {
    const engine = quiet("holes");
    const tile = engine.state.tiles.find((candidate) => candidate.trap && candidate.ring === 4)!;
    engine.state.elapsed = 55;
    engine.step(EMPTY_INPUT, dt);
    expect(tile.state).toBe("falling");
    advance(engine, 2);
    expect(tile.state).toBe("gone");
    expect(engine.tileAt(tile.x, tile.z)).toBeUndefined();
  });

  it("moves grounded feet, telegraphs reversal, and leaves airborne fighters unaffected", () => {
    const engine = quiet("conveyor");
    const tile = engine.state.tiles.find(
      (candidate) => candidate.conveyor && candidate.row === 2 && candidate.col === -2,
    )!;
    const player = engine.state.fighters[0]!;
    Object.assign(player, { x: tile.x, z: tile.z });
    const start = player.x;
    advance(engine, 0.1);
    expect(player.x).toBeLessThan(start);
    engine.state.elapsed = engine.state.stage.conveyorPeriod - 0.5;
    engine.step(EMPTY_INPUT, dt);
    expect(tile.conveyor?.reversing).toBe(true);
    const previousDirection = tile.conveyor!.x;
    engine.state.elapsed = engine.state.stage.conveyorPeriod;
    engine.step(EMPTY_INPUT, dt);
    expect(tile.conveyor!.x).toBe(-previousDirection);
    Object.assign(player, { x: tile.x, z: tile.z, y: 1.2, vx: 0, vz: 0, grounded: false });
    advance(engine, 0.1);
    expect(player.x).toBe(tile.x);
  });
});

describe("telegraphed meteors", () => {
  it("holds a fixed warning location, impacts once, and excludes repeated shockwave hits", () => {
    const engine = quiet("meteors");
    const player = engine.state.fighters[0]!;
    Object.assign(player, { x: 0, z: 0 });
    const rock = meteor();
    engine.state.meteors = [rock];
    advance(engine, 0.05);
    expect(player.damage).toBe(0);
    expect(rock.x).toBe(0);
    expect(rock.z).toBe(0);
    advance(engine, 0.07);
    expect(rock.phase).toBe("impact");
    expect(player.damage).toBe(22);
    expect(rock.hitTargets).toContain(player.id);
    Object.assign(player, {
      x: 3,
      z: 0,
      y: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      grounded: true,
      invulnerable: 0,
    });
    advance(engine, 0.15);
    expect(player.damage).toBe(22);
  });

  it("expanding shockwaves hit ground feet but can be cleared by a jump", () => {
    for (const height of [0, 1.2]) {
      const engine = quiet("meteors");
      const player = engine.state.fighters[0]!;
      Object.assign(player, { x: 3.4, z: 0, y: height, grounded: height === 0 });
      engine.state.meteors = [meteor({ phase: "impact", timeToImpact: 0, impactAge: 0.13 })];
      engine.step(EMPTY_INPUT, dt);
      expect(player.damage).toBe(height === 0 ? 10 : 0);
    }
  });

  it("automatically places fully warned meteors on surviving floor", () => {
    const engine = quiet("meteors");
    engine.state.fighters.forEach((fighter) => {
      fighter.invulnerable = 100;
    });
    advance(engine, 9.1);
    expect(engine.state.meteors.length).toBeGreaterThan(0);
    for (const rock of engine.state.meteors) {
      expect(rock.phase).toBe("warning");
      expect(rock.warningTime).toBe(2.8);
      expect(rock.timeToImpact).toBeGreaterThan(2.5);
      expect(engine.tileAt(rock.x, rock.z)).toBeDefined();
    }
  });
});

describe("safe-zone integration and CPU floor navigation", () => {
  it("keeps the larger 15-by-15 floor permanently solid", () => {
    const engine = quiet("safezone");
    expect(engine.state.tiles).toHaveLength(225);
    expect(engine.tileAt(7 * TILE_SIZE, 0)).toBeDefined();
    engine.state.elapsed = 1000;
    engine.step(EMPTY_INPUT, dt);
    expect(engine.state.safeRing).toBe(7);
    expect(engine.state.warning).toBe(false);
    expect(engine.state.tiles.every((tile) => tile.state === "solid")).toBe(true);
  });

  it("eliminates after four continuous seconds outside and awards the survivor", () => {
    const engine = quiet("safezone");
    const zone = engine.state.safeZone!;
    Object.assign(zone, { x: 0, z: 0, radius: 3, timer: 100, phase: "holding" });
    Object.assign(engine.state.fighters[0]!, { x: 8, z: 0 });
    Object.assign(engine.state.fighters[1]!, { x: 0, z: 0 });
    advance(engine, 3.9);
    expect(engine.state.fighters[0]!.alive).toBe(true);
    advance(engine, 0.11);
    expect(engine.state.fighters[0]!.alive).toBe(false);
    expect(engine.state.winnerId).toBe(1);
    expect(engine.state.series.wins[1]).toBe(1);
  });

  it("resets exposure on reentry and pauses both exposure and zone motion", () => {
    const engine = quiet("safezone");
    const zone = engine.state.safeZone!;
    Object.assign(zone, { x: 0, z: 0, radius: 3, timer: 100, phase: "holding" });
    const player = engine.state.fighters[0]!;
    Object.assign(player, { x: 8, z: 0 });
    Object.assign(engine.state.fighters[1]!, { x: 0, z: 0 });
    advance(engine, 2);
    expect(player.outsideZoneTime).toBeGreaterThan(1.9);
    engine.setPaused(true);
    const snapshot = JSON.stringify(zone);
    advance(engine, 5);
    expect(player.outsideZoneTime).toBeLessThan(2.1);
    expect(JSON.stringify(zone)).toBe(snapshot);
    engine.setPaused(false);
    player.x = 1.5;
    engine.step(EMPTY_INPUT, dt);
    expect(player.outsideZoneTime).toBe(0);
  });

  it("CPU survival takes priority over attacking during safe-zone telegraphs", () => {
    const engine = quiet("safezone");
    const zone = engine.state.safeZone!;
    Object.assign(zone, {
      x: 0,
      z: 0,
      radius: 15,
      targetX: -4,
      targetZ: 0,
      targetRadius: 3,
      phase: "warning",
      timer: 4,
      duration: 4,
    });
    const bot = engine.state.fighters[1]!;
    Object.assign(bot, { x: 7, z: 0, isPlayer: false, aiTimer: 0 });
    Object.assign(engine.state.fighters[0]!, { x: 8.2, z: 0 });
    advance(engine, 0.5);
    expect(bot.x).toBeLessThan(6.2);
    expect(bot.action).toBe("idle");
  });

  it("CPU routes around the donut center instead of steering into the hole", () => {
    const engine = quiet("holes");
    engine.state.hammers = [];
    engine.state.tiles.forEach((tile) => {
      delete tile.trap;
    });
    const bot = engine.state.fighters[1]!;
    Object.assign(bot, { x: -5.4, z: 0, isPlayer: false, aiTimer: 1000 });
    Object.assign(engine.state.fighters[0]!, { x: 5.4, z: 0 });
    for (let frame = 0; frame < 240; frame++) {
      engine.step(EMPTY_INPUT, dt);
      expect(bot.y).toBeGreaterThanOrEqual(0);
      expect(engine.tileAt(bot.x, bot.z)).toBeDefined();
    }
    expect(bot.x).toBeGreaterThan(0);
  });
});
