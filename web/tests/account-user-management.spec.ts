import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import { surfaceFixtures } from "./surface-fixtures";

test("admin accounts and mini users have separate management controls", async ({
  page,
}) => {
  await login(page);
  await surfaceFixtures(page);

  await page.getByRole("button", { name: "管理账号", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "管理账号", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../.runtime/admin-accounts.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "添加管理账号", exact: true }).click();
  const account = page.getByRole("dialog", { name: "添加管理账号" });
  await expect(account.getByLabel("登录账号")).toBeVisible();
  await expect(account.getByLabel("初始密码")).toBeVisible();
  await account.getByRole("button", { name: "关闭", exact: true }).click();

  await page.getByRole("button", { name: "用户管理", exact: true }).click();
  // Each user action has its own button in the row and its own small dialog.
  // The 扫码登记 table sits above the user list; take a user row.
  const row = page
    .locator("tbody tr")
    .filter({ has: page.getByRole("button", { name: "编辑", exact: true }) })
    .first();
  await row.getByRole("button", { name: "编辑", exact: true }).click();
  const profile = page.getByRole("dialog", { name: "编辑用户资料" });
  await expect(
    profile.getByRole("button", { name: "保存用户资料" }),
  ).toBeVisible();
  await profile.getByRole("button", { name: "关闭", exact: true }).click();
  await row.getByRole("button", { name: "停用", exact: true }).click();
  const status = page.getByRole("dialog", { name: "停用账号" });
  await expect(status.getByRole("button", { name: "停用账号" })).toBeVisible();
  await status.getByRole("button", { name: "关闭", exact: true }).click();
  // Users are only disabled, never archived.
  await expect(page.getByRole("button", { name: /归档/ })).toHaveCount(0);
  await page.screenshot({
    path: "../.runtime/account-user-management.png",
    fullPage: true,
  });
});
