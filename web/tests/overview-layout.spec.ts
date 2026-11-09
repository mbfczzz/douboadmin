import { test, expect } from "@playwright/test";
import { login } from "./helpers";

const breakdown = {
  totalUsers: 12,
  activeUsers: 5,
  creatorUsers: 3,
  payers: 1,
  ordersCreated: 2,
  ordersPaid: 1,
  pointsSold: 0,
  refunds: 1,
  directActivations: 1,
  providerActivations: 0,
  codesIssued: 0,
  codesRedeemed: 0,
  channels: {},
  providers: [],
  kinds: {},
  hours: [],
  weekdays: [],
  traffic: {
    uv: 3,
    pv: 9,
    visits: 4,
    pagesPerVisit: 2.3,
    avgVisitSeconds: 40,
    bounceRate: 0.25,
    newVisitors: 2,
    nextDayRetention: 0,
    retentionBase: 0,
    topPages: [],
    entryPages: [],
    scenes: [],
    sources: [],
    platforms: [],
    clients: [],
  },
};

test("tabs hold the daily detail and fit a 90-day chart on mobile", async ({
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
        breakdown,
        days: Array.from({ length: count }, (_, i) => ({
          date: new Date(Date.UTC(2026, 7, i + 1)).toISOString().slice(0, 10),
          newUsers: 1,
          activeUsers: 1,
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
  await expect(page.getByText("今日经营数据", { exact: true })).toBeVisible();
  await page.getByLabel("统计周期").selectOption("30");
  // The daily list starts open and shows the newest 10 days only.
  await expect(
    page.getByText("每日经营数据 · 最近 10 天", { exact: true }),
  ).toBeVisible();
  const daily = page.locator(".overview-details").first();
  await expect(
    daily.getByRole("columnheader", { name: "生成 / 成功 / 失败" }),
  ).toBeVisible();
  await expect(daily.locator("tbody tr")).toHaveCount(10);
  // No generation in 30 days: one hint instead of empty charts.
  await page.getByRole("tab", { name: "创作" }).click();
  await expect(page.getByText("所选时段还没有生成任务")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("统计周期").selectOption("90");
  await expect(page.getByText("峰值 9 次 / 日")).toBeVisible();
  const chart = page.getByRole("img", { name: "每日生成量趋势" });
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

test("headline figures compare with the previous period; costs stay honest", async ({
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
        previous: {
          newUsers: 6,
          activeUsers: 10,
          jobs: 8,
          succeeded: 8,
          paidFen: 0,
          refundFen: 0,
          revenueFen: 0,
          pv: 9,
          uv: 3,
        },
        breakdown,
        models: [
          { model: "partial-cost", calls: 2, known: 1, estimatedMicros: 1000 },
          { model: "known-cost", calls: 3, known: 3, estimatedMicros: 2000 },
        ],
        events: { page_view: 6 },
      },
    }),
  );
  await login(page);
  const cards = page.locator(".headline-card");
  await expect(cards.locator("strong")).toHaveText([
    "¥200.00",
    "12",
    "8",
    "5",
    "3",
  ]);
  await expect(cards.nth(0)).toContainText("上期为 0");
  await expect(cards.nth(0)).toContainText("退款 ¥50.00");
  await expect(cards.nth(1).locator(".delta.up")).toContainText("100.0%");
  await expect(cards.nth(2)).toContainText("持平");
  await expect(cards.nth(3).locator(".delta.down")).toContainText("50.0%");
  // Service metrics moved to 运行监控.
  await expect(page.getByText("服务接口")).toHaveCount(0);
  await page.getByRole("tab", { name: "创作" }).click();
  const table = page
    .locator(".overview-section")
    .filter({ hasText: "AI 调用成本" });
  await expect(
    table.locator("tr").filter({ hasText: "partial-cost" }),
  ).toContainText("待配置");
  await expect(
    table.locator("tr").filter({ hasText: "partial-cost" }),
  ).not.toContainText("$0.0010");
  await expect(
    table.locator("tr").filter({ hasText: "known-cost" }),
  ).toContainText("$0.0020");
  await page.getByRole("tab", { name: "流量" }).click();
  await expect(
    page.getByText("行为事件 · 前 10 项", { exact: true }),
  ).toBeVisible();
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

test("overview opens on today and can switch to a longer period", async ({
  page,
}) => {
  const asked: string[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.pathname === "/api/admin/dashboard")
      asked.push(url.searchParams.get("days") || "");
  });
  await login(page);
  const period = page.getByLabel("统计周期");
  await expect(period).toHaveValue("1");
  await expect(period.locator("option:checked")).toHaveText("今天");
  await period.selectOption("7");
  await expect.poll(() => asked.at(-1)).toBe("7");
  expect(asked[0]).toBe("1");
});

test("today charts the day by hour instead of one daily bar", async ({
  page,
}) => {
  await page.route("**/api/admin/dashboard?days=1", async (route) => {
    const real = await (await route.fetch()).json();
    const hours = Array.from({ length: 24 }, (_, i) => ({
      date: String(i).padStart(2, "0") + ":00",
      newUsers: 0,
      activeUsers: 0,
      jobs: i === 9 ? 4 : i === 10 ? 2 : 0,
      succeeded: 0,
      failed: 0,
      paidFen: 0,
      refundFen: 0,
      revenueFen: 0,
    }));
    real.days[0].jobs = 6;
    await route.fulfill({ json: { ...real, hours } });
  });
  await login(page);
  await page.getByRole("tab", { name: "创作" }).click();
  const chart = page.getByRole("img", { name: "今日生成量（按小时）" });
  await expect(chart.locator("div")).toHaveCount(24);
  const panel = page.locator("section.panel").filter({ has: chart });
  await expect(panel).toContainText("合计 6 次 · 峰值 4 次 / 小时");
  await expect(panel).toContainText("23:00");
});
