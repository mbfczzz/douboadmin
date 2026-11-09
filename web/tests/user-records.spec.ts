import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import { miniUser } from "./partner-helpers";

test("user rows open model use and activity records", async ({ page }) => {
  const user = await miniUser(page.request);
  await page.route(`**/api/admin/users/${user.userId}/models`, (route) =>
    route.fulfill({
      json: {
        models: [
          {
            model: "seedance-pro",
            name: "Seedance Pro",
            kind: "video",
            calls: 3,
            succeeded: 2,
            failed: 1,
            active: 0,
            pointsUnits: 2400,
            lastAt: "2026-11-09T08:00:00Z",
          },
        ],
        jobs: [
          {
            id: "job-1",
            model: "seedance-pro",
            name: "Seedance Pro",
            kind: "video",
            status: "failed",
            pointsUnits: 0,
            prompt: "海边日落的延时视频",
            error: "上游超时",
            createdAt: "2026-11-09T08:00:00Z",
            updatedAt: "2026-11-09T08:01:00Z",
          },
        ],
      },
    }),
  );
  await login(page);
  await page.getByRole("button", { name: "小程序用户", exact: true }).click();
  const row = page.locator("tbody tr").filter({ hasText: user.userId });
  await row.getByRole("button", { name: "模型记录", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "模型使用记录" });
  // Totals, per-model outcome bar, then the latest tasks.
  const stats = dialog.locator(".records-stats");
  await expect(stats).toContainText("使用模型1个");
  await expect(stats).toContainText("生成次数3次");
  await expect(stats).toContainText("成功率66.7%");
  await expect(stats).toContainText("实际扣除24积分");
  await expect(
    dialog.getByRole("img", { name: "成功 2，失败 1，进行中 0" }),
  ).toBeVisible();
  await expect(dialog.locator(".recent-jobs")).toContainText("上游超时");
  await dialog.getByRole("button", { name: "关闭" }).click();
  await row.getByRole("button", { name: "行为日志", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "行为日志" });
  const entries = dialog.locator(".timeline li");
  await expect(entries.filter({ hasText: "完善注册信息" })).toBeVisible({
    timeout: 10000,
  });
  await dialog.getByRole("tab", { name: "全部请求" }).click();
  await expect(entries.filter({ hasText: "发送短信验证码" })).toBeVisible();
  await expect(dialog.getByText(/^今天 · /)).toBeVisible();
  await entries
    .filter({ hasText: "完善注册信息" })
    .getByRole("button", { name: "详情" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "完善注册信息" }),
  ).toBeVisible();
});

test("without 日志管理 / 生成任务 the user records hide those views", async ({
  page,
}) => {
  const user = await miniUser(page.request);
  await login(page);
  await page.route("**/api/admin/me", async (route) => {
    const me = await (await route.fetch()).json();
    await route.fulfill({ json: { ...me, role: "custom", menus: ["users"] } });
  });
  await page.route(`**/api/admin/users/${user.userId}/models`, (route) =>
    route.fulfill({
      json: {
        models: [
          {
            model: "m",
            name: "模型",
            kind: "image",
            calls: 1,
            succeeded: 1,
            failed: 0,
            active: 0,
            pointsUnits: 100,
            lastAt: "2026-11-09T08:00:00Z",
          },
        ],
        jobs: [
          {
            id: "job-1",
            model: "m",
            name: "模型",
            kind: "image",
            status: "succeeded",
            pointsUnits: 100,
            billing: "charged",
            prompt: "猫",
            createdAt: "2026-11-09T08:00:00Z",
            updatedAt: "2026-11-09T08:00:00Z",
          },
        ],
        limited: false,
      },
    }),
  );
  await page.reload();
  await page.getByRole("button", { name: "小程序用户", exact: true }).click();
  const row = page.locator("tbody tr").filter({ hasText: user.userId });
  await expect(row.getByRole("button", { name: "模型记录" })).toBeVisible();
  await expect(row.getByRole("button", { name: "行为日志" })).toHaveCount(0);
  await row.getByRole("button", { name: "模型记录" }).click();
  const dialog = page.getByRole("dialog", { name: "模型使用记录" });
  await expect(dialog.getByText("猫")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "详情" })).toHaveCount(0);
});
