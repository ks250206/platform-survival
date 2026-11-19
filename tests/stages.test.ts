import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_OPTIONS, COLORS, TILE_SIZE } from "../src/game/types";
import { appearanceForFighter } from "../src/game/appearance";
import { createStagePlan, stageIdForRound, stageStateForRound, STAGES } from "../src/game/stages";

describe("composable stage presets", () => {
  it("places every fighter on a distinct supported tile in every layout and tier", () => {
    for (const definition of STAGES) {
      for (const round of [1, 3, 7]) {
        const plan = createStagePlan({ ...DEFAULT_OPTIONS, stage: definition.id }, round);
        expect(new Set(plan.tiles.map((tile) => tile.id)).size).toBe(plan.tiles.length);
        expect(plan.spawns).toHaveLength(24);
        expect(new Set(plan.spawns.map((spawn) => `${spawn.x}/${spawn.z}`)).size).toBe(24);
        for (const spawn of plan.spawns) {
          expect(
            plan.tiles.some(
              (tile) => tile.x === spawn.x && tile.z === spawn.z && tile.state === "solid",
            ),
          ).toBe(true);
        }
        for (let i = 0; i < plan.spawns.length; i++) {
          for (let j = i + 1; j < plan.spawns.length; j++) {
            expect(
              Math.hypot(
                plan.spawns[i]!.x - plan.spawns[j]!.x,
                plan.spawns[i]!.z - plan.spawns[j]!.z,
              ),
            ).toBeGreaterThanOrEqual(TILE_SIZE - 0.001);
          }
        }
      }
    }
  });
  it("preserves recognizably different floor silhouettes and a larger safe-zone platform", () => {
    const plans = STAGES.map((stage) =>
      createStagePlan({ ...DEFAULT_OPTIONS, stage: stage.id }, 1),
    );
    expect(plans.find((plan) => plan.stage.id === "sky")!.tiles).toHaveLength(121);
    const ring = plans.find((plan) => plan.stage.id === "holes")!;
    expect(ring.tiles.some((tile) => tile.col === 0 && tile.row === 0)).toBe(false);
    expect(
      plans
        .find((plan) => plan.stage.id === "hammers")!
        .tiles.some((tile) => tile.col === 4 && tile.row === 4),
    ).toBe(false);
    const wide = plans.find((plan) => plan.stage.id === "safezone")!;
    expect(wide.tiles).toHaveLength(225);
    expect(wide.stage.groundMode).toBe("safe-zone");
    expect(wide.safeZone).not.toBeNull();
  });
  it("uses deterministic tours without immediate repeats, including bag boundaries", () => {
    for (const seed of [0, 1, 5821, 90909]) {
      const options = { ...DEFAULT_OPTIONS, seed };
      const stages = Array.from({ length: 50 }, (_, i) => stageIdForRound(options, i + 1));
      expect(stages[0]).toBe("sky");
      expect(new Set(stages.slice(0, STAGES.length)).size).toBe(STAGES.length);
      expect(stages.slice(1).every((stage, i) => stage !== stages[i])).toBe(true);
      expect(stageIdForRound(options, 19)).toBe(stages[18]);
    }
  });
  it("caps escalation while adding readable combinations and keeping meteor warning time", () => {
    const options = { ...DEFAULT_OPTIONS, stage: "sky" as const };
    expect(createStagePlan(options, 1).spinners).toHaveLength(1);
    expect(createStagePlan(options, 3).spinners).toHaveLength(2);
    expect(createStagePlan(options, 5).stage.meteor).not.toBeNull();
    expect(stageStateForRound(options, 49)).toEqual(stageStateForRound(options, 7));
    expect(stageStateForRound(options, 49).meteor!.warningTime).toBe(2.8);
    expect(stageStateForRound({ ...options, mode: "single" }, 49).level).toBe(1);
  });
  it("does not share mutable hazards or floors between rounds", () => {
    const options = { ...DEFAULT_OPTIONS, stage: "chaos" as const };
    const first = createStagePlan(options, 5);
    const second = createStagePlan(options, 5);
    expect(first).toEqual(second);
    first.tiles[0]!.state = "gone";
    first.spinners[0]!.angle += 1;
    expect(second.tiles[0]!.state).toBe("solid");
    expect(first.spinners[0]!.angle).not.toBe(second.spinners[0]!.angle);
  });
});

describe("fighter identity", () => {
  it("provides24 unique body colors and stable multi-part CPU appearances", () => {
    expect(new Set(COLORS).size).toBe(24);
    const looks = Array.from({ length: 24 }, (_, id) => appearanceForFighter(id, DEFAULT_OPTIONS));
    expect(new Set(looks.map((look) => JSON.stringify(look))).size).toBe(24);
    expect(appearanceForFighter(18, { ...DEFAULT_OPTIONS })).toEqual(looks[18]);
    expect(looks[0]).toEqual(DEFAULT_OPTIONS.playerAppearance);
    expect(new Set(looks.slice(1).map((look) => look.accessory)).size).toBe(5);
  });
});
