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
  await expect(dialog).toContainText(
    "共使用 1 个模型 · 生成 3 次 · 消耗 24 积分",
  );
  await expect(dialog).toContainText("2 / 1 / 0");
  await expect(dialog).toContainText("上游超时");
  await dialog.getByRole("button", { name: "关闭" }).click();
  await row.getByRole("button", { name: "行为日志", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "行为日志" });
  await expect(
    dialog.locator("tbody tr").filter({ hasText: "完善注册信息" }),
  ).toBeVisible({ timeout: 10000 });
  await dialog.getByRole("tab", { name: "全部请求" }).click();
  await expect(
    dialog.locator("tbody tr").filter({ hasText: "发送短信验证码" }),
  ).toBeVisible();
  await dialog
    .locator("tbody tr")
    .filter({ hasText: "完善注册信息" })
    .getByRole("button", { name: "详情" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "完善注册信息" }),
  ).toBeVisible();
});
