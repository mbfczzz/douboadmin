import { test, expect } from "@playwright/test";
import { login } from "./helpers";
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
  expect(requests).not.toContain("/api/admin/partners/tree");

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
  await page
    .locator(".provider-tree-row")
    .filter({ hasText: longName })
    .getByRole("button", { name: "新增子级", exact: true })
    .click();
  const createChild = page.getByRole("dialog", { name: "新增下级服务商" });
  await expect(createChild.getByLabel("可授权账号额度")).toHaveAttribute(
    "max",
    "9",
  );
  await expect(createChild).toContainText("上级当前可用 9 个");
  await createChild.getByLabel("可授权账号额度").fill("10");
  await expect(createChild).toContainText("超出上级可用额度 1 个");
  await expect(
    createChild.getByRole("button", { name: "保存服务商", exact: true }),
  ).toBeDisabled();
  await page.screenshot({ path: "../.runtime/provider-create-quota.png" });
  await createChild.getByRole("button", { name: "关闭", exact: true }).click();
  expect(requests).toContain("/api/admin/partners/tree");
  await page.getByRole("button", { name: "编辑", exact: true }).first().click();
  const editor = page.getByRole("dialog", { name: "编辑服务商" });
  await expect(editor.getByRole("tab", { name: "基本信息" })).toBeVisible();
  await page.screenshot({ path: "../.runtime/provider-editor-desktop.png" });
  await editor.getByRole("tab", { name: "名额划拨" }).click();
  await expect(
    editor.getByRole("heading", { name: "名额划拨记录" }),
  ).toBeVisible();
  await editor.getByRole("tab", { name: "授权激活" }).click();
  await expect(editor.getByRole("heading", { name: "授权码" })).toBeVisible();
  await editor.getByRole("tab", { name: "算力分佣" }).click();
  await expect(editor.getByRole("heading", { name: "佣金流水" })).toBeVisible();
  await editor.getByRole("button", { name: "关闭", exact: true }).click();
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
