import { expect, test, type Page } from "@playwright/test";
import { openCodes, titles } from "./provider-code-fixture";

async function openProviders(page: Page) {
  const { dialog, row } = await openCodes(page);
  await expect(
    dialog.getByRole("tab", { name: titles.s1, exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("tab", { name: titles.s2, exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  return row;
}

for (const width of [1440, 390, 320]) {
  test(`platform offers only branch creation and invitation codes at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await openProviders(page);
    await expect(
      page.getByRole("button", { name: "新增子级", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "新增分公司", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(".provider-tree-row .provider-tree-actions button"),
    ).toHaveText(["分享码", "分佣", "编辑", "登录账号"]);
    await page.screenshot({
      path: `../.runtime/provider-scan-only-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  });
}

test("manual creation form sends a root branch and cannot select a child role", async ({
  page,
}) => {
  const row = await openProviders(page);
  await page.route("**/api/admin/roles", (route) =>
    route.fulfill({
      json: [
        {
          id: "partner",
          version: 1,
          data: { name: "服务商", scope: "partner", menus: ["partners"] },
        },
      ],
    }),
  );
  const bodies: Record<string, unknown>[] = [];
  await page.route("**/api/admin/partners", (route) => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill({ json: { ...row, id: "new-branch" } });
  });
  await page.getByRole("button", { name: "新增分公司", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "新增分公司", exact: true });
  await expect(dialog.getByLabel("服务商级别")).toHaveCount(0);
  await dialog.getByLabel("服务商名称", { exact: true }).fill("新增测试分公司");
  await dialog.getByLabel("账号", { exact: true }).fill("scan-only-branch");
  await dialog
    .getByLabel("初始密码", { exact: true })
    .fill("scan-only-branch-password");
  await dialog.getByRole("button", { name: "保存服务商", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(bodies).toEqual([
    {
      parentId: "root",
      role: "branch",
      name: "新增测试分公司",
      account: {
        username: "scan-only-branch",
        password: "scan-only-branch-password",
        role: "partner",
      },
    },
  ]);
});
