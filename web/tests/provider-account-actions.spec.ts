import { test, expect } from "@playwright/test";
import { confirmSubmission, login } from "./helpers";

test("provider login: open, role, password and status are separate actions", async ({
  page,
  request,
}) => {
  await login(page);
  const name = "登录账号验收" + Date.now();
  const created = await page.request.post("/api/admin/partners", {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: { parentId: "root", name, users: 1 },
  });
  expect(created.status()).toBe(200);
  await page.getByRole("button", { name: "服务商管理", exact: true }).click();
  const row = page.locator(".provider-tree-row").filter({ hasText: name });
  await row.getByRole("button", { name: "登录账号", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "登录账号", exact: true });

  const username = "acct" + Date.now();
  await dialog.getByLabel("账号", { exact: true }).fill(username);
  await dialog.getByLabel("初始密码").fill("fixture-provider-password");
  await dialog.getByRole("button", { name: "开通账号" }).click();
  await expect(dialog).toContainText(username);
  await expect(dialog).toContainText("尚未登录");
  await expect(dialog.locator(".modal-actions button")).toHaveText([
    "停用登录",
    "修改角色",
    "重置密码",
  ]);

  await dialog.getByRole("button", { name: "重置密码" }).click();
  const reset = page.getByRole("dialog", { name: "重置密码" });
  await reset.getByLabel("新密码").fill("fixture-provider-password-2");
  await reset.getByRole("button", { name: "保存新密码" }).click();
  await expect(reset).toHaveCount(0);
  await expect(page.locator(".save-confirmation")).toHaveCount(0);
  const signIn = await request.post("/api/admin/login", {
    data: { username, password: "fixture-provider-password-2" },
  });
  expect(signIn.status()).toBe(200);

  // The provider signing in above must not make the open dialog stale.
  await dialog.getByRole("button", { name: "停用登录" }).click();
  const approval = page.getByRole("dialog", { name: "停用服务商登录" });
  await expect(approval).toContainText("停用");
  await expect(approval).toContainText("否");
  await expect(approval).not.toContainText("未填写");
  await expect(approval).not.toContainText("密码");
  await confirmSubmission(page);
  await expect(dialog).toContainText("已停用");
  await dialog.getByRole("button", { name: "启用登录" }).click();
  await confirmSubmission(page);
  await expect(dialog).toContainText("正常");

  await dialog.getByRole("button", { name: "修改角色" }).click();
  const role = page.getByRole("dialog", { name: "修改角色" });
  await expect(role.getByLabel("角色")).toBeVisible();
  await role.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(role).toHaveCount(0);
});
