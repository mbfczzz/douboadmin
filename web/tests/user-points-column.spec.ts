import { expect, test } from "@playwright/test";
import { mockLogin } from "./mock-login";

for (const width of [1440, 390]) {
  test(`user balance is visible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockLogin(page);
    let balance = 12345;
    await page.route("**/api/admin/users?*", (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: "points-user",
              version: 1,
              createdAt: "2026-11-24T10:00:00Z",
              data: {
                nickname: "积分测试用户",
                name: "测试姓名",
                phone: "13900139000",
                availableUnits: balance,
              },
            },
          ],
          page: 1,
          size: 20,
          total: 1,
        },
      }),
    );
    await page.route("**/api/admin/users/points-user/wallet", (route) => {
      if (route.request().method() === "POST") {
        balance += Number(route.request().postDataJSON().units);
        return route.fulfill({
          json: { userId: "points-user", availableUnits: balance, heldUnits: 0 },
        });
      }
      return route.fulfill({
        json: {
          wallet: {
            userId: "points-user",
            availableUnits: balance,
            heldUnits: 0,
          },
        },
      });
    });
    if (width <= 640) {
      await page.getByRole("button", { name: "切换菜单" }).click();
      await page
        .getByRole("dialog", { name: "工作空间导航" })
        .getByRole("button", { name: "用户管理", exact: true })
        .click();
    } else {
      await page.getByRole("button", { name: "用户管理", exact: true }).click();
    }
    if (width > 640) {
      await expect(
        page.getByRole("columnheader", { name: "积分" }),
      ).toBeVisible();
      await expect(page.getByRole("cell", { name: "123.45" })).toBeVisible();
      await page.getByRole("button", { name: "积分", exact: true }).click();
      const editor = page.getByRole("dialog", { name: "调整积分" });
      await editor.getByLabel("积分变动（负数为扣减）").fill("10");
      await editor.getByLabel("操作原因").fill("测试补偿积分");
      await editor
        .getByRole("button", { name: "确认调整积分", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "确认增加积分" })
        .getByRole("button", { name: "确认提交" })
        .click();
      await expect(page.getByRole("cell", { name: "133.45" })).toBeVisible();
    } else {
      const card = page.locator(".mobile-record").first();
      await expect(card.locator("dt", { hasText: /^积分$/ })).toBeVisible();
      await expect(card.getByText("123.45", { exact: true })).toBeVisible();
    }
  });
}
