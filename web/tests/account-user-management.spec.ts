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

  await page.getByRole("button", { name: "小程序用户", exact: true }).click();
  await page.getByRole("button", { name: "详情 / 积分", exact: true }).click();
  const user = page.getByRole("dialog", { name: "小程序用户与积分" });
  await user.getByText("编辑小程序用户资料", { exact: true }).click();
  await expect(
    user.getByRole("button", { name: "保存用户资料" }),
  ).toBeVisible();
  await user.getByText("账号状态管理 · 正常", { exact: true }).click();
  await expect(user.getByRole("button", { name: "归档用户" })).toBeVisible();
  await page.screenshot({
    path: "../.runtime/account-user-management.png",
    fullPage: true,
  });
});
