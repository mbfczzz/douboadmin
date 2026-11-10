import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";
import { longName, surfaceFixtures } from "./surface-fixtures";

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
  // A provider login is scoped to its own node and below.
  if (provider)
    await page.route("**/api/admin/me", async (route) => {
      const response = await route.fetch();
      if (!response.ok()) return route.fulfill({ response });
      const me = await response.json();
      await route.fulfill({
        json: { ...me, scope: "partner", partnerId: provider },
      });
    });
  await login(page);
  await surfaceFixtures(page);
  await page.route("**/api/admin/partners/tree", (route) =>
    route.fulfill({ json: tree }),
  );
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
  await expect(page.locator(".provider-tree-row")).toHaveCount(3);
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
      "会员开通码",
      "S1 邀请码",
      "S2 邀请码",
      "服务商绑定码",
    ]);
    await expect(dialog.locator(".share-qr")).toBeVisible();
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
    "会员开通码",
    "S2 邀请码",
    "服务商绑定码",
  ]);
  await dialog.getByRole("button", { name: "关闭" }).first().click();
  await row(page, "质检推荐官")
    .getByRole("button", { name: "分享码", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "分享码" });
  await expect(dialog.getByRole("tab")).toHaveText([
    "会员开通码",
    "服务商绑定码",
  ]);
  await dialog.getByRole("tab", { name: "服务商绑定码" }).click();
  await expect(dialog.locator(".share-code")).toHaveText("BIND-2345");
  await expect(dialog.locator(".code-info")).toContainText("一次有效");
});

test("the platform picks S1 or S2 under a 分公司; an S1 adds S2", async ({
  page,
}) => {
  await open(page);
  const bodies: Record<string, unknown>[] = [];
  await page.route("**/api/admin/partners", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    bodies.push(route.request().postDataJSON());
    return route.fulfill({ json: tree[2] });
  });
  await expect(row(page, "质检推荐官").getByText("新增子级")).toHaveCount(0);
  for (const [parent, role] of [
    [longName, "S2 推荐官"],
    ["质检子级服务商", ""],
  ]) {
    await row(page, parent).getByRole("button", { name: "新增子级" }).click();
    const form = page.getByRole("dialog", { name: "新增下级服务商" });
    const level = form.getByLabel("服务商级别");
    if (role) {
      await expect(level.locator("option")).toHaveText([
        "S1 服务商",
        "S2 推荐官",
      ]);
      await level.selectOption({ label: role });
    } else await expect(level).toHaveCount(0);
    await form.getByLabel("服务商名称").fill("新下级");
    await form.getByRole("button", { name: "保存服务商" }).click();
    await expect(form).toHaveCount(0);
  }
  expect(bodies.map((b) => [b.parentId, b.role])).toEqual([
    ["qa-provider", "s2"],
    ["qa-child", "s2"],
  ]);
  expect(bodies.every((b) => !("users" in b))).toBe(true);
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
  await page.getByRole("button", { name: "小程序用户", exact: true }).click();
  await expect(page.getByLabel("搜索用户")).toBeVisible();
  await expect(page.getByRole("tab", { name: "扫码登记" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "扫码登记" })).toHaveCount(0);
  expect(requests).not.toContain("/api/admin/registrations");
});
