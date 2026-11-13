import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";
import { longName, surfaceFixtures } from "./surface-fixtures";
import { providerTreeFixture, expandProviderTree } from "./provider-tree-fixture";

const record = (id: string, name: string, role: string, parentId: string) => ({
  id,
  version: 1,
  createdAt: "2026-11-02T00:00:00Z",
  data: {
    name,
    role,
    parentId,
    path: [],
    status: "active",
    retailPer100Fen: 10000,
    childMarginBps: 5000,
  },
});
const tree = [
  record("qa-provider", longName, "branch", "root"),
  record("qa-child", "质检子级服务商", "s1", "qa-provider"),
  record("qa-s2", "质检推荐官", "s2", "qa-child"),
];
const row = (page: Page, name: string) =>
  page.locator(".provider-tree-row").filter({ hasText: name }).first();

async function open(page: Page, provider?: string) {
  await login(page);
  // A provider login is scoped to its own node and below.
  if (provider)
    await page.route("**/api/admin/me", async (route) => {
      const response = await route.fetch();
      if (!response.ok()) return route.fulfill({ response });
      const me = await response.json();
      await route.fulfill({
        json: { ...me, role: "s1", scope: "partner", partnerId: provider, menus: ["partners"] },
      });
    });
  if (provider) await page.reload();
  await surfaceFixtures(page);
  await providerTreeFixture(page, tree, provider);
  await page.route("**/api/admin/partners/qa-s2", (route) =>
    route.fulfill({
      json: {
        record: tree[2],
        price: { shares: [] },
        commission: { balanceFen: 0, heldFen: 0, paidOutFen: 0 },
      },
    }),
  );
  await page.getByRole("button", { name: "服务商管理", exact: true }).click();
  const count = provider ? 2 : 3;
  await expect(page.locator(".provider-tree-row")).toHaveCount(1);
  await expandProviderTree(page, count);
}

test("分享码 tabs follow the role", async ({ page }) => {
  await open(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await row(page, longName)
      .getByRole("button", { name: "分享码", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "分享码" });
    await expect(dialog.getByRole("tab")).toHaveText([
      "S1 服务商邀请码",
      "S2 推荐官邀请码",
      "子账号开通码",
    ]);
    await expect(dialog.locator(".share-poster")).toBeVisible();
    expect(
      await dialog
        .locator(".provider-panel")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await page.screenshot({
      path: `../.runtime/share-code-branch-${width}.png`,
      animations: "disabled",
    });
    await dialog.getByRole("button", { name: "关闭" }).first().click();
  }
  await row(page, "质检子级服务商")
    .getByRole("button", { name: "分享码", exact: true })
    .click();
  let dialog = page.getByRole("dialog", { name: "分享码" });
  await expect(dialog.getByRole("tab")).toHaveText([
    "S2 推荐官邀请码",
    "子账号开通码",
  ]);
  await dialog.getByRole("button", { name: "关闭" }).first().click();
  await row(page, "质检推荐官")
    .getByRole("button", { name: "分享码", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "分享码" });
  await expect(dialog.getByRole("tab")).toHaveCount(0);
  await expect(
    dialog.getByRole("heading", { name: "子账号开通码" }),
  ).toBeVisible();
  await dialog.locator(".owner-bind > summary").click();
  await expect(dialog.locator(".owner-bind .share-code")).toHaveText(
    "ABCD-6789",
  );
  await expect(dialog.locator(".owner-bind .code-info")).toContainText(
    "一次有效",
  );
});

test("the platform can add branches but has no manual child creation", async ({
  page,
}) => {
  await open(page);
  await expect(page.getByRole("button", { name: "新增子级" })).toHaveCount(0);
  await page.getByRole("button", { name: "新增分公司", exact: true }).click();
  const form = page.getByRole("dialog", { name: "新增分公司", exact: true });
  await expect(form.getByLabel("服务商名称")).toBeVisible();
  await expect(form.getByLabel("服务商级别")).toHaveCount(0);
});

test("provider logins grow only by codes and see no registrations", async ({
  page,
}) => {
  await open(page, "qa-child");
  await expect(page.getByRole("button", { name: "新增分公司" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "新增子级" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "分销规则" })).toHaveCount(0);
  const requests: string[] = [];
  page.on("request", (r) => requests.push(new URL(r.url()).pathname));
  await expect(page.getByRole("button", { name: "用户管理", exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "扫码登记" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "扫码登记" })).toHaveCount(0);
  expect(requests).not.toContain("/api/admin/registrations");
});
