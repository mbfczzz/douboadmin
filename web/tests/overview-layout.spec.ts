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
    name: "每日生成量，明细可在下方展开查看",
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
