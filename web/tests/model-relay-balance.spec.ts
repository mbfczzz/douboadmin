import { expect, test } from "@playwright/test";
import { mockLogin } from "./mock-login";
import { modelPage } from "./model-tab-fixture";

for (const width of [1440, 390, 320]) {
  test(`Managed balance displays precision, zero and refresh failures at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockLogin(page);
    await page.route("**/api/admin/models?*", (route) =>
      route.fulfill({ json: modelPage("image") }),
    );
    let calls = 0;
    await page.route("**/api/admin/models/balance", (route) => {
      expect(route.request().method()).toBe("GET");
      calls++;
      if (calls === 3)
        return route.fulfill({
          status: 502,
          json: { error: "中转站客户 Key 无效或已停用，请检查服务接入配置" },
        });
      return route.fulfill({
        json: {
          balance: calls === 1 ? 100.123456 : 0,
          unit: "points",
          checkedAt: "2026-11-15T12:00:00Z",
        },
      });
    });
    await page.goto("/#models");
    const balance = page.getByLabel("中转站账户余额", { exact: true });
    await expect(balance).toContainText("100.123456 积分");
    await expect(balance).toHaveAttribute("title", /已扣除任务预扣/);
    await page.getByRole("tab", { name: "图片模型", exact: true }).click();
    await expect(page.getByText("图片模型条目", { exact: true })).toBeVisible();
    expect(calls).toBe(1); // Changing filters must not query the remote account again.
    for (const name of ["拖动排序", "同步上游", "新增模型"]) {
      const button = page.getByRole("button", { name, exact: true });
      await expect(button).toBeVisible();
      const bounds = await button.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    }
    await page.screenshot({ path: `../.runtime/managed-balance-${width}.png` });
    const rect = await balance.boundingBox();
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
    await page.getByRole("button", { name: "刷新", exact: true }).click();
    await expect(balance).toContainText("0 积分");
    await balance
      .getByRole("button", { name: "刷新中转余额", exact: true })
      .click();
    await expect(balance).toContainText("查询失败");
    await expect(balance).not.toContainText("0 积分");
    await expect(balance).toHaveAttribute("title", /Key 无效或已停用/);
    await expect(
      page.getByRole("heading", { name: "模型管理", exact: true }),
    ).toBeVisible();
    await balance
      .getByRole("button", { name: "刷新中转余额", exact: true })
      .click();
    await expect(balance).toContainText("0 积分");
    await expect(balance).not.toHaveClass(/has-error/);
  });
}
