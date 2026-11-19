import { describe, expect, it } from "vite-plus/test";
import { GameEngine } from "../src/game/engine";
import { EMPTY_INPUT } from "../src/game/types";

const dt = 1 / 60;
function advance(engine: GameEngine, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / dt); i++) engine.step(EMPTY_INPUT, dt);
}
function finish(engine: GameEngine, winnerId: number | null) {
  engine.state.phase = "playing";
  engine.state.spinners = [];
  engine.state.hammers = [];
  engine.state.bumpers = [];
  for (const fighter of engine.state.fighters) {
    fighter.isPlayer = fighter.id === 0;
    fighter.y = fighter.id === winnerId ? 0 : -8;
  }
  engine.step(EMPTY_INPUT, dt);
  expect(engine.state.phase).toBe("finished");
}

describe("first-to-three round series", () => {
  it("awards each completed round once and stops at exactly three wins", () => {
    const engine = new GameEngine({ playerCount: 4, mode: "first-to-three", seed: 991 });
    engine.start();
    const winners = [0, 1, 0, 1, 0];
    for (const [index, winner] of winners.entries()) {
      expect(engine.state.series.round).toBe(index + 1);
      finish(engine, winner);
      const awarded = [...engine.state.series.wins];
      advance(engine, 1);
      expect(engine.state.series.wins).toEqual(awarded);
      expect(engine.state.series.history).toHaveLength(index + 1);
      if (index < winners.length - 1) {
        expect(engine.state.series.championId).toBeNull();
        engine.nextRound();
        expect(engine.state.phase).toBe("countdown");
      }
    }
    expect(engine.state.series.wins).toEqual([3, 2, 0, 0]);
    expect(engine.state.series.championId).toBe(0);
    const finalState = engine.state;
    engine.nextRound();
    expect(engine.state).toBe(finalState);
  });

  it("draws award no point, and next-round calls cannot skip active play", () => {
    const engine = new GameEngine({ playerCount: 4, mode: "first-to-three" });
    engine.start();
    const first = engine.state;
    engine.nextRound();
    expect(engine.state).toBe(first);
    finish(engine, null);
    expect(engine.state.series.wins).toEqual([0, 0, 0, 0]);
    expect(engine.state.series.history[0]?.winnerId).toBeNull();
    engine.nextRound();
    expect(engine.state.series.round).toBe(2);
    expect(engine.state.phase).toBe("countdown");
    engine.nextRound();
    expect(engine.state.series.round).toBe(2);
  });

  it("single-round mode crowns its winner immediately and cannot advance", () => {
    const engine = new GameEngine({ playerCount: 4, mode: "single", stage: "sky" });
    engine.start();
    finish(engine, 2);
    expect(engine.state.series.targetWins).toBe(1);
    expect(engine.state.series.championId).toBe(2);
    engine.nextRound();
    expect(engine.state.series.round).toBe(1);
  });

  it("preserves identities and cosmetics while fully resetting per-round combat", () => {
    const engine = new GameEngine({ playerCount: 24, mode: "first-to-three", seed: 2026 });
    const identities = engine.state.fighters.map(({ id, name, color, appearance }) => ({
      id,
      name,
      color,
      appearance,
    }));
    expect(new Set(identities.map((fighter) => fighter.color)).size).toBe(24);
    engine.start();
    finish(engine, 4);
    engine.nextRound();
    expect(
      engine.state.fighters.map(({ id, name, color, appearance }) => ({
        id,
        name,
        color,
        appearance,
      })),
    ).toEqual(identities);
    for (const fighter of engine.state.fighters) {
      expect(fighter.alive).toBe(true);
      expect(fighter.damage).toBe(0);
      expect(fighter.stamina).toBe(100);
      expect(fighter.outsideZoneTime).toBe(0);
      expect(fighter.placement).toBe(0);
      expect(fighter.item).toBe(false);
      expect(engine.tileAt(fighter.x, fighter.z)).toBeDefined();
    }
    expect(engine.state.series.wins[4]).toBe(1);
    expect(engine.state.projectiles).toHaveLength(0);
    expect(engine.state.meteors).toHaveLength(0);
    expect(engine.state.elapsed).toBe(0);
  });

  it("uses monotonic event IDs across rounds and fresh IDs for a new series", () => {
    const engine = new GameEngine({ playerCount: 4 });
    engine.start();
    finish(engine, 0);
    const firstId = Math.max(...engine.state.events.map((event) => event.id));
    engine.nextRound();
    finish(engine, 1);
    expect(Math.min(...engine.state.events.map((event) => event.id))).toBeGreaterThan(firstId);
    engine.reset();
    expect(engine.state.phase).toBe("lobby");
    expect(engine.state.series.history).toHaveLength(0);
    expect(engine.state.series.wins.every((wins) => wins === 0)).toBe(true);
    engine.start();
    finish(engine, 0);
    expect(engine.state.events[0]?.id).toBe(1);
  });

  it("replays a seeded multi-round series deterministically", () => {
    const engine = new GameEngine({ playerCount: 6, seed: 445 });
    const run = () => {
      engine.start();
      const rounds: string[] = [];
      for (let round = 0; round < 3; round++) {
        advance(engine, 5);
        rounds.push(JSON.stringify(engine.state));
        finish(engine, round % 2);
        engine.nextRound();
      }
      return rounds;
    };
    const first = run();
    expect(run()).toEqual(first);
  });

  it("increases later-round hazard pressure but caps its difficulty", () => {
    const engine = new GameEngine({ playerCount: 24, mode: "first-to-three", stage: "sky" });
    engine.start();
    const initial = engine.state.stage;
    for (let round = 1; round < 9; round++) {
      finish(engine, round); // Different CPUs keep the series running.
      engine.nextRound();
    }
    expect(engine.state.series.round).toBe(9);
    expect(engine.state.stage.level).toBe(3);
    expect(engine.state.stage.speedMultiplier).toBeGreaterThan(initial.speedMultiplier);
    expect(engine.state.stage.firstCollapse).toBeLessThan(initial.firstCollapse);
    expect(engine.state.spinners.length).toBeGreaterThan(1);
    expect(engine.state.stage.meteor).not.toBeNull();
    const cap = { ...engine.state.stage };
    finish(engine, 10);
    engine.nextRound();
    expect(engine.state.stage).toEqual(cap);
  });
});
