import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import { surfaceFixtures } from "./surface-fixtures";

test("users and providers are isolated sidebar routes", async ({ page }) => {
  await login(page);
  await surfaceFixtures(page);
  const requests: string[] = [];
  page.on("request", (request) =>
    requests.push(new URL(request.url()).pathname),
  );

  await page.getByRole("button", { name: "小程序用户", exact: true }).click();
  await expect(page).toHaveURL(/#users$/);
  await expect(page.getByLabel("搜索用户")).toBeVisible();
  expect(requests).toContain("/api/admin/users");
  expect(requests).not.toContain("/api/admin/partners/root");

  await page.getByRole("button", { name: "服务商管理", exact: true }).click();
  await expect(page).toHaveURL(/#partners$/);
  await expect(
    page.getByRole("heading", { name: "服务商管理", exact: true }),
  ).toBeVisible();
  expect(requests).toContain("/api/admin/partners/root");
  await page.screenshot({
    path: "../.runtime/users-partners-desktop.png",
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "../.runtime/users-partners-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "切换菜单" }).click();
  await page
    .getByRole("dialog", { name: "工作空间导航" })
    .getByRole("button", { name: "小程序用户", exact: true })
    .click();
  await expect(page).toHaveURL(/#users$/);
  await expect(page.getByLabel("搜索用户")).toBeVisible();
});
