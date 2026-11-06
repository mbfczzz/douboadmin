import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("overview exposes daily detail and fits a 90-day chart on mobile", async ({
  page,
}) => {
  await login(page);
  await page.route("**/api/admin/dashboard?*", (route) => {
    const count = Number(
      new URL(route.request().url()).searchParams.get("days"),
    );
    return route.fulfill({
      json: {
        period: count,
        models: [],
        events: {},
        days: Array.from({ length: count }, (_, i) => ({
          date: new Date(Date.UTC(2026, 7, i + 1)).toISOString().slice(0, 10),
          newUsers: 0,
          activeUsers: 0,
          jobs: count === 90 && i === 89 ? 9 : 0,
          succeeded: 0,
          failed: 0,
          paidFen: 0,
          refundFen: 0,
          revenueFen: 0,
        })),
      },
    });
  });
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(page.getByText("所选时段暂无生成任务")).toBeVisible();
  await page.getByText("每日经营数据 · 30 天", { exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: "生成 / 成功 / 失败" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("统计周期").selectOption("90");
  await expect(page.getByText("峰值 9 次 / 日")).toBeVisible();
  const chart = page.getByRole("img", {
    name: "每日生成量趋势",
  });
  expect(
    await chart.evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBeTruthy();
  const bounds = await chart.boundingBox();
  const lastDay = await chart.locator("div").last().boundingBox();
  expect(lastDay!.width).toBeGreaterThan(0);
  expect(lastDay!.height).toBeGreaterThan(0);
  expect(lastDay!.x + lastDay!.width).toBeLessThanOrEqual(
    bounds!.x + bounds!.width,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("overview groups real metrics and marks incomplete costs without a false zero", async ({
  page,
}) => {
  await page.route("**/api/admin/dashboard?*", (route) =>
    route.fulfill({
      json: {
        period: 30,
        days: Array.from({ length: 30 }, (_, i) => ({
          date: new Date(Date.UTC(2026, 9, 8 + i)).toISOString().slice(0, 10),
          newUsers: i === 29 ? 12 : 0,
          activeUsers: i === 29 ? 5 : 0,
          jobs: i === 29 ? 8 : 0,
          succeeded: i === 29 ? 6 : 0,
          failed: i === 29 ? 2 : 0,
          paidFen: i === 29 ? 20000 : 0,
          refundFen: i === 29 ? 5000 : 0,
          revenueFen: i === 29 ? 15000 : 0,
        })),
        models: [
          { model: "partial-cost", calls: 2, known: 1, estimatedMicros: 1000 },
          { model: "known-cost", calls: 3, known: 3, estimatedMicros: 2000 },
        ],
        events: { page_view: 6 },
      },
    }),
  );
  await login(page);
  const cards = page.locator(".overview-page .business-metrics .panel");
  await expect(cards).toHaveCount(4);
  await expect(cards.locator("strong")).toHaveText([
    "12",
    "8",
    "¥150.00",
    "¥50.00",
  ]);
  await expect(cards.first()).toContainText("今日活跃 5 人");
  const chart = await page
    .getByRole("img", { name: "每日生成量趋势" })
    .boundingBox();
  const attention = await page.locator(".attention-panel").boundingBox();
  expect(chart!.width).toBeGreaterThan(attention!.width * 1.5);
  const table = page.locator(".overview-section").first();
  await expect(
    table.locator("tr").filter({ hasText: "partial-cost" }),
  ).toContainText("待配置");
  await expect(
    table.locator("tr").filter({ hasText: "partial-cost" }),
  ).not.toContainText("$0.0010");
  await expect(
    table.locator("tr").filter({ hasText: "known-cost" }),
  ).toContainText("$0.0020");
  await page.getByText("行为事件", { exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: "事件", exact: true }),
  ).toBeVisible();
  await page
    .locator(".attention-panel")
    .getByRole("button", { name: /2 个生成任务失败/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "生成任务", exact: true }),
  ).toBeVisible();
});
