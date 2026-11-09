import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers";

const traffic = {
  pv: 1280,
  uv: 320,
  visits: 400,
  pagesPerVisit: 3.2,
  avgVisitSeconds: 95,
  bounceRate: 0.25,
  newVisitors: 80,
  nextDayRetention: 0.4,
  retentionBase: 50,
  topPages: [
    { page: "pages/templates/index", pv: 600, uv: 300 },
    { page: "pages/create/index", pv: 400, uv: 200 },
    { page: "pages/some-new-page/index", pv: 10, uv: 4 },
  ],
  entryPages: [{ page: "pages/templates/index", visits: 360 }],
  scenes: [
    { scene: 1001, visits: 250 },
    { scene: 1007, visits: 100 },
    { scene: 1234, visits: 50 },
  ],
  platforms: [
    { platform: "ios", visits: 240 },
    { platform: "android", visits: 160 },
  ],
};

async function dashboard(page: Page, withTraffic: boolean) {
  await page.route("**/api/admin/dashboard?*", (route) =>
    route.fulfill({
      json: {
        period: 30,
        models: [],
        events: {},
        days: Array.from({ length: 30 }, (_, i) => ({
          date: new Date(Date.UTC(2026, 9, 8 + i)).toISOString().slice(0, 10),
          newUsers: 0,
          activeUsers: 0,
          jobs: 0,
          succeeded: 0,
          failed: 0,
          paidFen: 0,
          refundFen: 0,
          revenueFen: 0,
          pv: i === 29 ? 42 : 0,
          uv: i === 29 ? 9 : 0,
        })),
        breakdown: withTraffic ? { traffic } : undefined,
      },
    }),
  );
}

test("overview shows anonymous visit statistics without crowding", async ({
  page,
}) => {
  await dashboard(page, true);
  await login(page);
  const section = page.locator(".traffic-section");
  await expect(
    section.getByRole("heading", { name: "访问统计" }),
  ).toBeVisible();
  const kpis = section.locator(".traffic-kpis dd");
  await expect(kpis).toHaveText([
    "1,280",
    "320",
    "400",
    "3.2",
    "1 分 35 秒",
    "25.0%",
    "80",
    "40.0%",
  ]);
  const pages = section.getByRole("list", { name: "热门页面" });
  await expect(pages).toContainText("创作模板（首页）");
  await expect(pages).toContainText("some-new-page");
  const sources = section.getByRole("list", { name: "访问来源" });
  await expect(sources).toContainText("发现栏小程序主入口");
  await expect(sources).toContainText("单人聊天会话分享");
  await expect(sources).toContainText("其他（场景值 1234）");
  await expect(section.getByRole("list", { name: "设备平台" })).toContainText(
    "iOS",
  );
  await page.getByRole("tab", { name: "浏览量" }).click();
  await expect(page.getByText("峰值 42 次 / 日")).toBeVisible();
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    // Tiles keep room for their value: none wraps or is clipped.
    for (const tile of await section.locator(".traffic-kpis > div").all()) {
      const box = await tile.boundingBox();
      expect(box!.width).toBeGreaterThan(140);
    }
    await section.screenshot({
      path: `../.runtime/overview-traffic-${width}.png`,
    });
  }
});

test("overview tolerates a dashboard without visit statistics", async ({
  page,
}) => {
  await dashboard(page, false);
  await login(page);
  await expect(page.getByText("暂无访问数据")).toBeVisible();
  await page.getByRole("tab", { name: "访客数" }).click();
  await expect(page.getByText("峰值 9 人 / 日")).toBeVisible();
});
