import { test, expect } from "@playwright/test";
import path from "node:path";

const image = path.resolve("../media/brand/doubo.png");
const icon = "https://icons.fixture.test/doubo.png";

for (const width of [1440, 390]) {
  test(`project logo on login and navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let signedIn = false;
    await page.route("**/api/**", (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/api/admin/login") {
        signedIn = true;
        return route.fulfill({ json: { ok: true } });
      }
      if (pathname === "/api/admin/me") return route.fulfill(signedIn ? {
        json: { id: "fixture-admin", account: "admin", name: "测试管理员", role: "super_admin", scope: "platform", menus: ["overview"] },
      } : { status: 401, json: {} });
      return route.fulfill({ json: { models: [], categories: [] } });
    });
    await page.route("**/api/branding", (route) => route.fulfill({ json: { icon } }));
    await page.route("**/api/brand-icon", (route) => route.fulfill({ path: image, contentType: "image/png" }));
    await page.route(icon, (route) => route.fulfill({ path: image, contentType: "image/png" }));
    await page.goto("/");
    const logo = page.getByRole("img", { name: "豆播 AI", exact: true });
    await expect(logo).toHaveAttribute("src", icon);
    await expect.poll(() => logo.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(1794);
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((node) => getComputedStyle(node).objectFit)).toBe("contain");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: `../.runtime/brand-login-${width}.png` });
    // Auth and business APIs remain isolated from the real test database.
    await page.getByLabel("账号", { exact: true }).fill("admin");
    await page.getByLabel("密码", { exact: true }).fill("Tt66c76b");
    await page.getByRole("button", { name: "登录管理台" }).click();
    if (width < 640) await page.getByRole("button", { name: "切换菜单" }).click();
    await expect.poll(() => page.locator(".sidebar").evaluate((node) => node.getBoundingClientRect().left)).toBeGreaterThanOrEqual(0);
    const sidebarLogo = page.locator(".sidebar .project-logo");
    await expect(sidebarLogo).toBeVisible();
    await expect.poll(() => sidebarLogo.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(1794);
    const box = await sidebarLogo.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(160);
    expect((box?.width || 0) / (box?.height || 1)).toBeCloseTo(1794 / 876, 1);
    await page.screenshot({ path: `../.runtime/brand-sidebar-${width}.png` });
  });
}
