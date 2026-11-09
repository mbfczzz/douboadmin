import { test, expect } from "@playwright/test";
import { confirmSubmission, login } from "./helpers";
import { surfaceFixtures } from "./surface-fixtures";

test("quick jump and page filters remember recent work", async ({ page }) => {
  await login(page);
  await page.keyboard.press("Control+K");
  const palette = page.getByRole("dialog", { name: "快速跳转" });
  await expect(palette).toBeVisible();
  await page.screenshot({ path: "../.runtime/admin-1440-快速跳转.png" });
  await palette.getByLabel("搜索后台功能").fill("服务商");
  await palette.getByRole("button", { name: /服务商管理/ }).click();
  await expect(
    page.getByRole("heading", { name: "服务商列表", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "小程序用户", exact: true }).click();
  await page.getByLabel("搜索用户").fill("需要记住");
  await page.getByRole("button", { name: "管理账号", exact: true }).click();
  await page.getByRole("button", { name: "小程序用户", exact: true }).click();
  await expect(page.getByLabel("搜索用户")).toHaveValue("需要记住");
  await page.keyboard.press("Control+K");
  await expect(
    page
      .locator(".command-list")
      .first()
      .getByRole("button", {
        name: /管理账号/,
      }),
  ).toBeVisible();
});

test("overview prioritizes operational exceptions", async ({ page }) => {
  await page.route("**/api/admin/dashboard?days=1", (route) =>
    route.fulfill({
      json: {
        days: [
          {
            date: "2026-11-04",
            newUsers: 0,
            activeUsers: 1,
            jobs: 3,
            succeeded: 1,
            failed: 2,
            paidFen: 0,
            refundFen: 0,
            revenueFen: 0,
          },
        ],
        models: [
          { model: "seedance", calls: 4, known: 1, estimatedMicros: 1000 },
        ],
        events: {},
        period: 1,
      },
    }),
  );
  await login(page);
  const panel = page.locator(".attention-panel");
  await expect(panel).toContainText("2 个生成任务失败");
  await expect(panel).toContainText("3 次 AI 调用成本未知");
});

test("mobile records expose every field without horizontal discovery", async ({
  page,
}) => {
  await login(page);
  await surfaceFixtures(page);
  await page.getByRole("button", { name: "小程序用户", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const record = page.locator(".mobile-record").first();
  await expect(record).toBeVisible();
  await expect(record).toContainText("使用授权");
  await expect(record).toContainText("注册时间");
  await expect(
    record.getByRole("button", { name: "详情", exact: true }),
  ).toBeVisible();
  await expect(
    record.getByRole("button", { name: "积分", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".record-table > .table-scroll")).toHaveCount(0);
});

test("failed commands stay visible until dismissed", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "模型管理", exact: true }).click();
  await page.route("**/api/admin/models/sync", (route) =>
    route.fulfill({ status: 503, json: { error: "同步服务暂时不可用" } }),
  );
  await page.getByRole("button", { name: "同步上游", exact: true }).click();
  await confirmSubmission(page);
  const alert = page
    .getByRole("alert")
    .filter({ hasText: "同步服务暂时不可用" });
  await expect(alert).toBeVisible();
  await page.waitForTimeout(3800);
  await expect(alert).toBeVisible();
  await alert.getByRole("button", { name: "关闭通知" }).click();
  await expect(alert).toHaveCount(0);
});
