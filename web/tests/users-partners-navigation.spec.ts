import { test, expect } from "@playwright/test";
import { login, answerAsk } from "./helpers";
import { longName, surfaceFixtures } from "./surface-fixtures";

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
  // 扫码登记 is its own tab and loads only when opened.
  expect(requests).not.toContain("/api/admin/registrations");
  await page.getByRole("tab", { name: "扫码登记", exact: true }).click();
  await expect.poll(() => requests).toContain("/api/admin/registrations");
  await page.getByRole("tab", { name: "小程序用户", exact: true }).click();
  expect(requests).not.toContain("/api/admin/memberships");

  await page.getByRole("button", { name: "服务商管理", exact: true }).click();
  await expect(page).toHaveURL(/#partners$/);
  await expect(
    page.getByRole("heading", { name: "服务商列表", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "编辑", exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("质检子级服务商", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: `收起${longName}`, exact: true })
    .click();
  await expect(page.getByText("质检子级服务商", { exact: true })).toBeHidden();
  await page
    .getByRole("button", { name: `展开${longName}`, exact: true })
    .click();
  await expect(page.getByText("质检子级服务商", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "新增子级", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "新增分公司", exact: true }).click();
  const createChild = page.getByRole("dialog", { name: "新增分公司" });
  await createChild.getByLabel("服务商名称").fill("未保存的分公司");
  await page.screenshot({ path: "../.runtime/provider-create-branch.png" });
  await createChild.getByRole("button", { name: "关闭", exact: true }).click();
  // Typed edits ask before they are discarded.
  await answerAsk(page, true);
  expect(requests).toContain("/api/admin/partners/tree");
  // Every provider function has its own row button and dialog.
  const row = page.locator(".provider-tree-row").first();
  for (const [button, title, heading] of [
    ["编辑", "编辑服务商", ""],
    ["分享码", "分享码", "已加入的会员"],
    ["分佣", "算力分佣", "佣金流水"],
  ]) {
    await row.getByRole("button", { name: button, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: title, exact: true });
    await expect(dialog).toBeVisible();
    if (heading)
      await expect(
        dialog.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
    else
      await page.screenshot({
        path: "../.runtime/provider-editor-desktop.png",
      });
    // No tabs into other functions; 分享码 only switches between its codes.
    await expect(
      dialog.getByRole("tab", { name: /名额|分佣|编辑|登录账号/ }),
    ).toHaveCount(0);
    await dialog
      .getByRole("button", { name: "关闭", exact: true })
      .first()
      .click();
  }
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
