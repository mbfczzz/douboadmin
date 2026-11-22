import { test, expect } from "@playwright/test";
import { mockLogin } from "./mock-login";

for (const width of [1440, 390]) {
  test(`settled point statistics and period changes at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1100 });
    await mockLogin(page);
    let includePoints = true;
    await page.route("**/api/admin/dashboard?*", (route) => {
      const days = Number(
        new URL(route.request().url()).searchParams.get("days"),
      );
      const factor = days === 1 ? 1 : 2;
      const points = {
        spentUnits: 123456 * factor,
        imageUnits: 100000 * factor,
        videoUnits: 20000 * factor,
        otherUnits: 3456 * factor,
        chargedJobs: 4 * factor,
        reservedUnits: 987650,
        reservedJobs: 9,
        releasedUnits: 725 * factor,
        releasedJobs: 2 * factor,
      };
      const metric = {
        newUsers: 2,
        activeUsers: 3,
        jobs: 10,
        succeeded: 6,
        failed: 2,
        paidFen: 1000,
        refundFen: 0,
        revenueFen: 1000,
        spentUnits: points.spentUnits,
      };
      return route.fulfill({
        json: {
          ...(includePoints ? { points } : {}),
          period: days,
          models: [],
          events: {},
          days: [{ ...metric, date: "2026-11-22" }],
          hours:
            days === 1
              ? Array.from({ length: 24 }, (_, hour) => ({
                  ...Object.fromEntries(
                    Object.entries(metric).map(([key, value]) => [
                      key,
                      hour === 0 ? value : 0,
                    ]),
                  ),
                  date: `${String(hour).padStart(2, "0")}:00`,
                  spentUnits: hour === 0 ? points.spentUnits : 0,
                }))
              : undefined,
          breakdown: {
            totalUsers: 20,
            activeUsers: 3,
            creatorUsers: 2,
            payers: 1,
            kinds: {},
            hours: [],
            weekdays: [],
            ordersCreated: 1,
            ordersPaid: 1,
            pointsSold: 10000,
            channels: {},
            refunds: 0,
            memberActivations: 0,
            ownerActivations: 0,
            providers: [],
          },
        },
      });
    });
    await page.getByRole("button", { name: "刷新", exact: true }).click();
    const summary = page.getByRole("region", { name: "积分统计", exact: true });
    const cards = summary.locator(".points-card");
    await expect(cards.locator("strong")).toHaveText([
      "1,234.56",
      "1,000",
      "200",
      "34.56",
      "9,876.5",
      "7.25",
    ]);
    await expect(
      summary.getByLabel("今日已使用积分", { exact: true }),
    ).toContainText("成功结算 4 个任务");
    await expect(summary.getByLabel("当前待结算积分")).toContainText(
      "9 个任务 · 未计入已用",
    );
    await expect(summary.getByLabel("今日失败已退回积分")).toContainText(
      "2 个任务 · 含人工退回",
    );
    const headline = page.locator(".headline-card");
    await expect(headline).toHaveCount(6);
    await expect(headline.nth(3)).toContainText("平均每次 308.64 积分");
    const area = await summary.boundingBox();
    const top = await page.locator(".headline").boundingBox();
    const tabs = await page
      .getByRole("tablist", { name: "概览分类" })
      .boundingBox();
    expect(area!.y).toBeGreaterThanOrEqual(top!.y + top!.height);
    expect(area!.y + area!.height).toBeLessThanOrEqual(tabs!.y);
    expect(
      await summary.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("point-statistics.png"),
      fullPage: true,
    });
    await page.getByRole("tab", { name: "创作", exact: true }).click();
    await page.getByRole("tab", { name: "积分消耗", exact: true }).click();
    await expect(page.locator(".overview-tab")).toContainText(
      "合计 1,234.56 积分",
    );

    await page.getByLabel("统计周期").selectOption("7");
    await expect(
      summary
        .getByLabel("近 7 天已使用积分", { exact: true })
        .locator("strong"),
    ).toHaveText("2,469.12");
    await expect(
      summary.getByLabel("当前待结算积分").locator("strong"),
    ).toHaveText("9,876.5");
    await expect(
      summary.getByLabel("近 7 天失败已退回积分").locator("strong"),
    ).toHaveText("14.5");
    includePoints = false;
    await page.getByRole("button", { name: "刷新", exact: true }).click();
    await expect(cards.locator("strong")).toHaveText([
      "—",
      "—",
      "—",
      "—",
      "—",
      "—",
    ]);
  });
}
