import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import { surfaceFixtures } from "./surface-fixtures";

const pages = [
  "工作概览",
  "创作模板",
  "管理账号",
  "小程序用户",
  "服务商管理",
  "系统设置",
];

test("capture representative admin surfaces", async ({ page }) => {
  test.setTimeout(90000);
  await login(page);
  await surfaceFixtures(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    for (const name of pages) {
      if (width < 640) {
        await page.getByRole("button", { name: "切换菜单" }).click();
        await page
          .getByRole("dialog", { name: "工作空间导航" })
          .getByRole("button", { name, exact: true })
          .click();
      } else {
        await page.getByRole("button", { name, exact: true }).click();
      }
      if (name === "服务商管理")
        await expect(
          page.getByRole("heading", { name: "服务商列表", exact: true }),
        ).toBeVisible();
      else
        await expect(
          page.getByRole("heading", { name, exact: true }),
        ).toBeVisible();
      if (width < 640) {
        await expect(
          page.getByRole("dialog", { name: "工作空间导航" }),
        ).toBeHidden();
        await page.waitForTimeout(250);
      }
      await page.screenshot({
        path: `../.runtime/admin-${width}-${name}.png`,
        fullPage: true,
      });
    }
  }
});
