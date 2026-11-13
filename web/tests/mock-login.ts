import { expect, type Page } from "@playwright/test";

// Isolated browser session: all API traffic is intercepted, no database or
// real credentials are needed. Feature tests override the relevant routes.
export async function mockLogin(page: Page) {
  let signedIn = false;
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/admin/login") {
      signedIn = true;
      return route.fulfill({ json: { ok: true } });
    }
    if (path === "/api/admin/me")
      return route.fulfill(
        signedIn
          ? {
              json: {
                id: "browser-admin",
                account: "admin",
                name: "测试管理员",
                role: "super_admin",
                scope: "platform",
                menus: [
                  "overview",
                  "templates",
                  "jobs",
                  "works",
                  "orders",
                  "payments",
                  "monitor",
                  "users",
                  "partners",
                  "accounts",
                  "roles",
                  "models",
                  "feedback",
                  "settings",
                  "logs",
                ],
              },
            }
          : { status: 401, json: { error: "请登录" } },
      );
    if (path === "/api/config")
      return route.fulfill({
        json: {
          models: [],
          categories: [],
          demo: false,
          relayConfigured: false,
        },
      });
    if (path === "/api/admin/platform")
      return route.fulfill({
        json: {
          capabilities: { payment: false },
          record: { id: "platform", version: 1, data: {} },
        },
      });
    if (path === "/api/admin/roles/labels")
      return route.fulfill({
        json: {
          branch: "分公司",
          s1: "S1 服务商",
          s2: "S2 推荐官",
          member: "会员",
        },
      });
    return route.fulfill({
      status: 503,
      json: { error: "此测试未配置该接口" },
    });
  });
  await page.goto("/");
  await page.getByLabel("账号", { exact: true }).fill("admin");
  await page.getByLabel("密码", { exact: true }).fill("Tt66c76b");
  await page.getByRole("button", { name: "登录管理台" }).click();
  await expect(
    page.getByRole("heading", { name: "工作概览", exact: true }),
  ).toBeVisible();
}
