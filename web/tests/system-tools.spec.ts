import { expect, test } from "@playwright/test";
import { mockLogin } from "./mock-login";

for (const width of [1440, 390]) {
  test(`FFmpeg checks distinguish API, workers and stale results at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1100 });
    await mockLogin(page);
    let calls = 0;
    const nodes = () => {
      const now = Date.now();
      const ready = {
        status: "ready",
        version: calls > 1 ? "8.0" : "7.1.1",
        path: "/usr/bin/ffmpeg",
      };
      const tools = {
        ffmpeg: ready,
        ffprobe: { ...ready, path: "/usr/bin/ffprobe" },
        checkedAt: new Date(now).toISOString(),
      };
      return [
        {
          id: "api-current",
          data: {
            host: "api-host",
            role: "serve",
            seenAt: new Date(now).toISOString(),
            mediaTools: tools,
          },
        },
        {
          id: "worker-missing",
          data: {
            host: "worker-missing",
            role: "worker",
            seenAt: new Date(now).toISOString(),
            mediaTools: {
              ...tools,
              ffmpeg: {
                status: "missing",
                error: "未在服务进程的 PATH 中找到，请安装并检查服务环境。",
              },
            },
          },
        },
        {
          id: "worker-old",
          data: {
            host: "worker-old",
            role: "worker",
            seenAt: new Date(now).toISOString(),
          },
        },
        {
          id: "worker-offline",
          data: {
            host: "worker-offline",
            role: "worker",
            seenAt: new Date(now - 120000).toISOString(),
            mediaTools: tools,
          },
        },
        {
          id: "worker-stale",
          data: {
            host: "worker-stale",
            role: "worker",
            seenAt: new Date(now).toISOString(),
            mediaTools: {
              ...tools,
              checkedAt: new Date(now - 180000).toISOString(),
            },
          },
        },
        {
          id: "worker-failed",
          data: {
            host: "worker-failed",
            role: "worker",
            seenAt: new Date(now).toISOString(),
            mediaTools: {
              ...tools,
              ffmpeg: {
                status: "failed",
                error: "版本命令执行失败，请检查权限或缺失的动态库。",
              },
            },
          },
        },
        {
          id: "worker-timeout",
          data: {
            host: "worker-timeout",
            role: "worker",
            seenAt: new Date(now).toISOString(),
            mediaTools: {
              ...tools,
              ffmpeg: {
                status: "timeout",
                error: "版本检查超时，请检查可执行文件及服务运行环境。",
              },
            },
          },
        },
      ];
    };
    await page.route("**/api/admin/system-tools", (route) => {
      calls++;
      return route.fulfill({
        json: { currentId: "api-current", nodes: nodes() },
      });
    });
    await page.route("**/api/admin/integrations", (route) =>
      route.fulfill({ json: { available: true, canManage: true, groups: [] } }),
    );
    await page.route("**/api/admin/monitor", (route) =>
      route.fulfill({
        json: {
          instances: nodes(),
          queue: { queued: 0, running: 0, failedHour: 0 },
          database: true,
          redisConfigured: true,
          ossConfigured: true,
          relayConfigured: true,
        },
      }),
    );
    for (const kind of ["alerts", "logs"]) {
      await page.route(`**/api/admin/${kind}?*`, (route) =>
        route.fulfill({ json: { items: [], total: 0, page: 1 } }),
      );
    }
    if (width < 640)
      await page.getByRole("button", { name: "切换菜单", exact: true }).click();
    await page.getByRole("button", { name: "系统设置", exact: true }).click();
    const panel = page.getByRole("region", {
      name: "FFmpeg 检测",
      exact: true,
    });
    const node = (name: string) =>
      panel
        .locator("tr, article")
        .filter({ has: page.getByText(name, { exact: true }) });
    await expect(node("api-host")).toContainText("版本 7.1.1");
    await expect(node("api-host")).toContainText("当前 API");
    await expect(node("worker-missing")).toContainText("未找到");
    await expect(node("worker-missing")).toContainText("PATH");
    await expect(node("worker-failed")).toContainText("执行异常");
    await expect(node("worker-timeout")).toContainText("检测超时");
    for (const [host, state] of [
      ["worker-old", "未检测"],
      ["worker-offline", "节点离线"],
      ["worker-stale", "结果已过期"],
    ]) {
      await expect(node(host)).toContainText(state);
      await expect(node(host).locator(".badge.succeeded")).toHaveCount(0);
    }
    await page.screenshot({
      path: testInfo.outputPath("ffmpeg-checks.png"),
      fullPage: true,
    });
    await panel.getByRole("button", { name: "重新检测", exact: true }).click();
    await expect(node("api-host")).toContainText("版本 8.0");
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
    if (width < 640)
      await page.getByRole("button", { name: "切换菜单", exact: true }).click();
    await page.getByRole("button", { name: "运行监控", exact: true }).click();
    const monitor = page.locator("#monitor-nodes");
    await expect(
      monitor.getByText("FFmpeg 未找到", { exact: true }),
    ).toBeVisible();
    await expect(
      monitor.getByText("FFmpeg 结果已过期", { exact: true }),
    ).toBeVisible();
    await expect(
      monitor.getByText("FFmpeg 未检测", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "全部节点（7）", exact: true })
      .click();
    await expect(
      monitor.getByText("FFmpeg 节点离线", { exact: true }),
    ).toBeVisible();
  });
}
