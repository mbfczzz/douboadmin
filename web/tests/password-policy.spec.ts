import { test, expect, type Page } from "@playwright/test";
import { mockLogin } from "./mock-login";

async function accounts(page: Page) {
  await mockLogin(page);
  const account = { id: "fixture-account", version: 1, data: { username: "operator", name: "运营", role: "operator" } };
  await page.route("**/api/admin/accounts?*", route => route.fulfill({json: { canManage: true, items: [account], total: 1, page: 1, size: 20 }}));
  await page.route("**/api/admin/roles", route => route.fulfill({json: [{ id: "operator", data: { name: "运营", scope: "platform", menus: ["accounts"] } }]}));
  await page.getByRole("button", { name: "管理账号", exact: true }).click();
}

test("account creation enforces the eight-character mixed-case rule", async ({ page }) => {
  await accounts(page);
  await page.getByRole("button", { name: "添加管理账号" }).click();
  const create = page.getByRole("dialog", { name: "添加管理账号" });
  const initial = create.getByLabel("初始密码");
  await expect(initial).toHaveAttribute("maxlength", "8");
  for (const value of ["abcdefgh", "ABCDEFGH", "12345678", "Ab12!456", "Ab12345"]) {
    await initial.fill(value);
    expect(await initial.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(false);
  }
  await initial.fill("Ab123456");
  expect(await initial.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(true);
});

test("password reset generates a compliant password and blocks symbols", async ({ page }) => {
  await accounts(page);
  await page.getByRole("button", { name: "重置密码", exact: true }).click();
  const reset = page.getByRole("dialog", { name: "重置密码" });
  await reset.getByRole("button", { name: "随机生成" }).click();
  await expect(reset.getByLabel("新密码")).toHaveValue(/^(?=.*[a-z])(?=.*[A-Z])[A-Za-z0-9]{8}$/);
  await reset.getByLabel("新密码").fill("Ab12_456");
  await reset.getByRole("button", { name: "保存新密码" }).click();
  await expect(reset).toBeVisible();
});
