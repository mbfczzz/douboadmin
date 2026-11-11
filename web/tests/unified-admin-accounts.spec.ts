import { expect, test } from "@playwright/test";
import { mockLogin } from "./mock-login";

test("provider logins appear with ownership and use their scoped account dialog", async ({ page }) => {
  await page.route("**/media/brand/doubo.png", (route) => route.fulfill({ path: "../media/brand/doubo.png", contentType: "image/png" }));
  await mockLogin(page);
  const provider = {
    id: "provider-login", version: 1, createdAt: "2026-11-11",
    data: { username: "provider-demo", name: "服务商登录", role: "branch", partnerId: "provider-a", partnerName: "山东分公司", partnerRole: "branch", disabled: false },
  };
  const platform = { id: "platform-login", version: 1, data: { username: "platform-demo", name: "平台运营员", role: "operator" } };
  await page.route("**/api/admin/roles", (route) => route.fulfill({ json: [
    { id: "operator", data: { name: "平台运营", scope: "platform", menus: ["accounts"] } },
    { id: "branch", data: { name: "分公司", scope: "partner", menus: ["partners"] } },
  ] }));
  await page.route("**/api/admin/accounts?*", (route) => route.fulfill({ json: {
    canManage: true, page: 1, size: 20, total: 2, items: [platform, provider],
  } }));
  let providerWrites = 0, platformWrites = 0;
  await page.route("**/api/admin/accounts/*", (route) => {
    platformWrites++;
    return route.fulfill({ status: 400, json: { error: "wrong account endpoint" } });
  });
  await page.route("**/api/admin/partners/provider-a/account**", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      expect(body.accountId).toBe(provider.id);
      expect(body.role).toBe("branch");
      expect(body.disabled).toBe(true);
      expect(body.version).toBe(provider.version);
      providerWrites++;
      provider.data.disabled = body.disabled;
      provider.version++;
    } else expect(new URL(route.request().url()).searchParams.get("accountId")).toBe(provider.id);
    return route.fulfill({ json: { account: provider } });
  });
  await page.getByRole("button", { name: "管理账号", exact: true }).click();
  const providerRow = page.locator("tbody tr").filter({ hasText: "provider-demo" });
  await expect(providerRow).toContainText("山东分公司");
  await expect(providerRow).toContainText("分公司");
  await expect(providerRow.getByRole("button")).toHaveText(["管理登录"]);
  const platformRow = page.locator("tbody tr").filter({ hasText: "platform-demo" });
  await expect(platformRow).toContainText("平台");
  await expect(platformRow.getByRole("button")).toHaveText(["编辑", "重置密码", "停用", "归档"]);
  await providerRow.getByRole("button", { name: "管理登录" }).click();
  const dialog = page.getByRole("dialog", { name: "登录账号", exact: true });
  await expect(dialog).toContainText("provider-demo");
  await expect(dialog).toContainText("山东分公司");
  await dialog.getByRole("button", { name: "停用登录", exact: true }).click();
  await page.getByRole("dialog", { name: "停用服务商登录" }).getByRole("button", { name: "确认提交", exact: true }).click();
  await expect(dialog).toContainText("已停用");
  await expect(providerRow).toContainText("已停用");
  expect(providerWrites).toBe(1);
  expect(platformWrites).toBe(0);
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await page.screenshot({ path: "../.runtime/unified-admin-accounts.png", fullPage: true });
});

test("account pagination returns to a valid page after concurrent archiving", async ({ page }) => {
  await mockLogin(page);
  let total = 21;
  const requested: number[] = [];
  await page.route("**/api/admin/roles", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/admin/accounts?*", (route) => {
    const current = Number(new URL(route.request().url()).searchParams.get("page"));
    requested.push(current);
    return route.fulfill({ json: { canManage: false, page: current, size: 20, total,
      items: current === 2 && total === 1 ? [] : [{ id: "fixture-"+current, version: 1, data: { username: "login-"+current, name: "账号第"+current+"页", role: "operator" } }],
    } });
  });
  await page.getByRole("button", { name: "管理账号", exact: true }).click();
  await expect(page.locator("tbody tr").filter({ hasText: "login-1" })).toBeVisible();
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.locator("tbody tr").filter({ hasText: "login-2" })).toBeVisible();
  total = 1;
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(page.locator("tbody tr").filter({ hasText: "login-1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "添加管理账号", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "管理登录", exact: true })).toHaveCount(0);
  expect(requested.at(-1)).toBe(1);
});
