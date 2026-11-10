import { expect, test } from "@playwright/test";
import { mockLogin } from "./mock-login";

test("acknowledging an alert refreshes the full monitor count", async ({ page }) => {
  await mockLogin(page);
  let acknowledged = false, healthReads = 0;
  await page.route("**/api/admin/monitor", route => {
    healthReads++;
    return route.fulfill({ json: {
      pendingAlerts: acknowledged ? 520 : 521, errorsHour: 0, instances: [],
      queue: { queued: 0, running: 0, failedHour: 0 }, database: true,
      relayConfigured: true, ossConfigured: true, redisConfigured: true,
    } });
  });
  await page.route("**/api/admin/logs?*", route => route.fulfill({ json: { items: [], total: 0, page: 1, size: 20 } }));
  await page.route("**/api/admin/alerts?*", route => route.fulfill({ json: {
    items: [{ id: "alert-one", version: 1, createdAt: "2026-11-10T00:00:00Z", data: { kind: "test", message: "测试告警", acknowledged } }],
    total: 521, page: 1, size: 20,
  } }));
  await page.route("**/api/admin/alerts/alert-one/ack", route => {
    acknowledged = true;
    return route.fulfill({ json: { ok: true } });
  });
  await page.getByRole("button", { name: "运行监控", exact: true }).click();
  await expect(page.getByText("521 条告警待确认", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "异常告警", exact: true }).click();
  await page.getByRole("button", { name: "确认收到", exact: true }).click();
  await expect(page.getByText("520 条告警待确认", { exact: true })).toBeVisible();
  expect(healthReads).toBeGreaterThanOrEqual(2);
});
