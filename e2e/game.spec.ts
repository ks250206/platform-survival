import { expect, test } from "@playwright/test";

test("24-fighter battle boots, consumes stamina, pauses and restarts", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  const start = page.getByRole("button", { name: "バトルスタート" });
  await expect(start).toBeEnabled({ timeout: 45_000 });
  await expect(
    page.getByRole("group", { name: "対戦人数" }).getByRole("button", { name: "24体" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("desktop-lobby.png") });
  await start.click();
  await expect(page.locator(".countdown-overlay")).toBeVisible();
  await expect(page.locator(".contestant-dot")).toHaveCount(24);
  await expect(page.locator(".countdown-overlay")).toBeHidden({ timeout: 25_000 });
  await page.keyboard.press("k");
  await expect
    .poll(async () =>
      Number(
        await page.getByRole("progressbar", { name: "スタミナ" }).getAttribute("aria-valuenow"),
      ),
    )
    .toBeLessThan(90);
  await page.keyboard.press("Space");
  await page.screenshot({ path: testInfo.outputPath("desktop-battle.png") });
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  await expect(page.getByRole("button", { name: "バトルに戻る" })).toBeVisible();
  const pausedTime = await page.locator(".timer b").textContent();
  await page.waitForTimeout(250);
  expect(await page.locator(".timer b").textContent()).toBe(pausedTime);
  await page.getByRole("button", { name: "バトルに戻る" }).click();
  await page.keyboard.press("r");
  await expect(page.locator(".countdown-overlay")).toBeVisible();
  await expect(page.locator(".contestant-dot")).toHaveCount(24);
  await expect(page.locator(".contestant-dot.out")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test.describe("touch layout", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  test("portrait has usable lobby, touch controls and no horizontal overflow", async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("./");
    const start = page.getByRole("button", { name: "バトルスタート" });
    await expect(start).toBeEnabled({ timeout: 45_000 });
    await expect(start).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath("mobile-lobby.png") });
    await start.tap();
    await expect(page.locator(".countdown-overlay")).toBeHidden({ timeout: 25_000 });
    await expect(page.getByRole("button", { name: "ジャンプ", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "しっぽスピン", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "しっぽスピン", exact: true }).tap();
    await expect
      .poll(async () =>
        Number(
          await page.getByRole("progressbar", { name: "スタミナ" }).getAttribute("aria-valuenow"),
        ),
      )
      .toBeLessThan(90);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath("mobile-battle.png") });
    expect(errors).toEqual([]);
  });
});
