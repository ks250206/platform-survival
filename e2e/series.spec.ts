import { expect, test, type Page } from "@playwright/test";
import type { GameEngine } from "../src/game/engine";
import type { StageId } from "../src/game/types";

type DebugWindow = Window & { __TAILSPIN__?: { engine: GameEngine } };
const stages: StageId[] = [
  "sky",
  "twin",
  "hammers",
  "conveyor",
  "holes",
  "meteors",
  "safezone",
  "chaos",
];

async function ready(page: Page) {
  await page.goto("./");
  await expect(page.getByRole("button", { name: "バトルスタート" })).toBeEnabled({
    timeout: 45_000,
  });
}
async function awardRound(page: Page, winnerId: number) {
  // The existing development hook exercises real engine scoring and real UI transitions.
  // It is absent from the production build used by the separate smoke tests.
  await page.evaluate((id) => {
    const engine = (window as DebugWindow).__TAILSPIN__!.engine;
    engine.state.phase = "playing";
    for (const fighter of engine.state.fighters) {
      fighter.alive = fighter.id === id;
      fighter.placement = fighter.id === id ? 0 : fighter.id + 2;
      fighter.y = 0;
      fighter.grounded = true;
      fighter.vx = 0;
      fighter.vy = 0;
      fighter.vz = 0;
    }
    engine.step(
      { moveX: 0, moveZ: 0, jump: false, weak: false, strong: false, roll: false, throw: false },
      1 / 60,
    );
  }, winnerId);
}

test("series carries scores and identities through next rounds, crowns3wins and resets", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  await page.getByRole("button", { name: "バトルスタート" }).click();
  const identity = await page.evaluate(() =>
    (window as DebugWindow).__TAILSPIN__!.engine.state.fighters.map((fighter) => ({
      color: fighter.color,
      appearance: fighter.appearance,
    })),
  );
  for (let wins = 1; wins <= 3; wins++) {
    await awardRound(page, 0);
    const result = page.locator(".series-result");
    await expect(result).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => (window as DebugWindow).__TAILSPIN__!.engine.state.series.wins[0]),
      )
      .toBe(wins);
    await page.screenshot({
      path: info.outputPath(wins === 3 ? "series-champion.png" : `round-${wins}-result.png`),
      animations: "disabled",
    });
    if (wins < 3) {
      await page.getByRole("button", { name: "次のラウンドへ", exact: true }).click();
      await expect(page.locator(".countdown-overlay")).toBeVisible();
      expect(
        await page.evaluate(() => {
          const state = (window as DebugWindow).__TAILSPIN__!.engine.state;
          return {
            round: state.series.round,
            alive: state.fighters.filter((fighter) => fighter.alive).length,
            damage: state.fighters[0]!.damage,
          };
        }),
      ).toEqual({ round: wins + 1, alive: 24, damage: 0 });
      expect(
        await page.evaluate(() =>
          (window as DebugWindow).__TAILSPIN__!.engine.state.fighters.map((fighter) => ({
            color: fighter.color,
            appearance: fighter.appearance,
          })),
        ),
      ).toEqual(identity);
    }
  }
  await expect(page.getByRole("button", { name: "次のラウンドへ", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "新しいシリーズ", exact: true }).click();
  expect(
    await page.evaluate(() => {
      const series = (window as DebugWindow).__TAILSPIN__!.engine.state.series;
      return {
        round: series.round,
        wins: series.wins.reduce((a, b) => a + b, 0),
        champion: series.championId,
      };
    }),
  ).toEqual({ round: 1, wins: 0, champion: null });
  expect(errors).toEqual([]);
});

test("all eight stage previews rebuild their geometry and single mode remains playable", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  for (const stage of stages) {
    await page.getByLabel("ステージ", { exact: true }).selectOption(stage);
    await expect
      .poll(() => page.evaluate(() => (window as DebugWindow).__TAILSPIN__!.engine.state.stage.id))
      .toBe(stage);
    await page.screenshot({ path: info.outputPath(`stage-${stage}.png`) });
  }
  await page.locator(".lobby-advanced > summary").click();
  const bodyColor = page
    .getByRole("group", { name: "ボディの色", exact: true })
    .getByRole("button")
    .nth(4);
  await bodyColor.click();
  await expect(bodyColor).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("しっぽの先を自由に選ぶ", { exact: true }).fill("#ff714c");
  await page.getByLabel("足の色を自由に選ぶ", { exact: true }).fill("#542ea7");
  await page.getByLabel("アクセサリー", { exact: true }).selectOption("bow");
  await page.getByLabel("アクセサリーの色を自由に選ぶ", { exact: true }).fill("#ffe36a");
  const appearance = {
    tailTipColor: 0xff714c,
    shoeColor: 0x542ea7,
    accessory: "bow",
    accessoryColor: 0xffe36a,
  };
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as DebugWindow).__TAILSPIN__!.engine.state.fighters[0]!.appearance,
      ),
    )
    .toEqual(appearance);
  await page.screenshot({ path: info.outputPath("customized-lobby.png") });
  await page.getByRole("button", { name: /1戦勝負/ }).click();
  await page.getByRole("button", { name: "バトルスタート" }).click();
  await awardRound(page, 0);
  await expect(page.getByRole("dialog", { name: "バトル結果", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "次のラウンドへ", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /もう一度あそぶ/ })).toBeVisible();
  const playedSeed = await page.evaluate(
    () => (window as DebugWindow).__TAILSPIN__!.engine.state.options.seed,
  );
  await page.getByRole("button", { name: "ロビーに戻る", exact: true }).click();
  await expect(page.getByLabel("ステージ", { exact: true })).toHaveValue("chaos");
  await expect(page.locator(".arena-caption strong")).toHaveText("カオス・カーニバル");
  await page.getByLabel("ステージ", { exact: true }).selectOption("safezone");
  await expect(page.locator(".arena-caption strong")).toHaveText("ワンダリング・セーフティ");
  expect(
    await page.evaluate(() => {
      const state = (window as DebugWindow).__TAILSPIN__!.engine.state;
      return { seed: state.options.seed, appearance: state.fighters[0]!.appearance };
    }),
  ).toEqual({ seed: playedSeed, appearance });
  expect(errors).toEqual([]);
});

test.describe("touch hazard previews", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  test("meteor warnings and moving safe-zone forecast are visible on a phone-sized viewport", async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await ready(page);
    for (const stage of ["meteors", "safezone"] as const) {
      await page.evaluate((stageId) => {
        const engine = (window as DebugWindow).__TAILSPIN__!.engine;
        engine.start({ stage: stageId, mode: "single", playerCount: 24 });
        engine.state.phase = "playing";
        for (const fighter of engine.state.fighters) fighter.aiTimer = 1000;
        const seconds = stageId === "meteors" ? 9.2 : 8.3;
        for (let i = 0; i < seconds * 60; i++)
          engine.step(
            {
              moveX: 0,
              moveZ: 0,
              jump: false,
              weak: false,
              strong: false,
              roll: false,
              throw: false,
            },
            1 / 60,
          );
      }, stage);
      await expect
        .poll(() =>
          page.evaluate(() => (window as DebugWindow).__TAILSPIN__!.engine.state.stage.id),
        )
        .toBe(stage);
      if (stage === "meteors") await expect(page.locator(".hazard-notice")).toContainText("隕石");
      else await expect(page.locator(".collapse-status")).toContainText("安全地帯");
      await page.screenshot({ path: info.outputPath(`mobile-${stage}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    expect(errors).toEqual([]);
  });
});
