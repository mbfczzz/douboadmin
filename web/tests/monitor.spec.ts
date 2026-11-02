import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import type { Health } from "../src/monitor/types";

function health(): Health {
  return {
    instances: [0, 120000].map((age, i) => ({
      id: `instance-${i}`,
      version: 1,
      createdAt: new Date().toISOString(),
      data: {
        host: i ? "offline-node" : "online-node",
        role: "serve",
        seenAt: new Date(Date.now() - age).toISOString(),
        heapBytes: 1048576,
        goroutines: 12,
        dbOpen: 3,
        dbInUse: 1,
        goVersion: "go1.26.4",
      },
    })),
    queue: { queued: 2, running: 1, failedHour: 3 },
    database: true,
    redisConfigured: false,
    ossConfigured: false,
    relayConfigured: true,
    paymentConfigured: false,
    hotConfigured: false,
  };
}

test("monitor filters offline instances, refreshes all data and acknowledges alerts", async ({
  page,
}) => {
  await login(page);
  const calls = { monitor: 0, alerts: 0, logs: 0, ack: 0 };
  let acknowledged = false;
  const row = {
    id: "monitor-ui-fixture",
    version: 1,
    createdAt: new Date().toISOString(),
  };
  await page.route("**/api/admin/monitor", (route) => {
    calls.monitor++;
    return route.fulfill({ json: health() });
  });
  await page.route("**/api/admin/alerts", (route) => {
    calls.alerts++;
    return route.fulfill({
      json: [{ ...row, data: { message: "测试节点告警", acknowledged } }],
    });
  });
  await page.route("**/api/admin/logs", (route) => {
    calls.logs++;
    return route.fulfill({
      json: [
        {
          ...row,
          data: {
            message: "测试错误记录",
            level: "ERROR",
            detail: "可展开的错误详情",
          },
        },
      ],
    });
  });
  await page.route("**/api/admin/alerts/monitor-ui-fixture/ack", (route) => {
    expect(route.request().method()).toBe("PUT");
    calls.ack++;
    acknowledged = true;
    return route.fulfill({ json: { ok: true } });
  });
  await page.getByRole("button", { name: "运行监控", exact: true }).click();
  await expect(page.getByText("online-node", { exact: true })).toBeVisible();
  await expect(page.getByText("offline-node", { exact: true })).toHaveCount(0);
  await expect(page.locator(".monitor-metrics strong")).toHaveText([
    "1",
    "2",
    "1",
    "3",
  ]);
  await page.getByRole("button", { name: "全部节点（2）" }).click();
  await expect(page.getByText("offline-node", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "只看在线" }).click();
  await expect(page.getByText("offline-node", { exact: true })).toHaveCount(0);
  const before = { ...calls };
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await expect
    .poll(() => [calls.monitor, calls.alerts, calls.logs])
    .toEqual([before.monitor + 1, before.alerts + 1, before.logs + 1]);
  await page.getByText("测试错误记录").click();
  await expect(page.getByText("可展开的错误详情")).toBeVisible();
  await page.getByRole("tab", { name: "异常告警", exact: true }).click();
  await page.getByRole("button", { name: "确认收到", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "已确认", exact: true }),
  ).toBeDisabled();
  expect(calls.ack).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "刷新", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("unavailable monitor data stays unknown and retry restores real states", async ({
  page,
}) => {
  await login(page);
  let failed = true;
  await page.route("**/api/admin/monitor", (route) =>
    route.fulfill(
      failed
        ? { status: 503, json: { error: "监控暂时不可用" } }
        : { json: health() },
    ),
  );
  for (const name of ["logs", "alerts"]) {
    await page.route(`**/api/admin/${name}`, (route) =>
      route.fulfill({ json: [] }),
    );
  }
  await page.getByRole("button", { name: "运行监控", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".monitor-metrics strong")).toHaveText([
    "—",
    "—",
    "—",
    "—",
  ]);
  await expect(
    page.locator(".monitor-connections").getByText("未读取", { exact: true }),
  ).toHaveCount(6);
  failed = false;
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("online-node", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "异常告警", exact: true }).click();
  await expect(page.getByText("暂无异常告警", { exact: true })).toBeVisible();
  expect(
    (await page.locator(".monitor-events").boundingBox())!.height,
  ).toBeLessThan(300);
});
