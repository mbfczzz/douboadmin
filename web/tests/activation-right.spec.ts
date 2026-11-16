import { expect, test, type Page } from "@playwright/test";
import { mockLogin } from "./mock-login";

// 下级小程序开通权限: the super administrator's per-provider switch, and the
// 开通 / 拒绝 actions a provider login gets only with it on.
const partner = (id: string, role: string, extra: Record<string, unknown> = {}) => ({
  id,
  version: 1,
  createdAt: "2026-11-10T00:00:00Z",
  children: 0,
  data: {
    name: { branch: "华东分公司", s1: "上海服务商", s2: "浦东服务商" }[role],
    role,
    parentId: "root",
    path: [],
    status: "active",
    retailPer100Fen: 10000,
    childMarginBps: 5000,
    ...extra,
  },
});

async function partners(page: Page, rows: unknown[]) {
  await page.route("**/api/admin/partners/tree?**", (route) =>
    route.fulfill({ json: { items: rows, page: 1, total: rows.length } }),
  );
  await page.goto("/#partners");
  // mockLogin signed in as the platform; reload to take the provider identity.
  await page.reload();
  await expect(page.getByRole("button", { name: "管理账号" })).toHaveCount(0);
}

test("the super administrator turns one provider's switch on", async ({ page }) => {
  await mockLogin(page);
  let on = false;
  const bodies: unknown[] = [];
  await page.route("**/api/admin/partners/b1/activation", (route) => {
    bodies.push(route.request().postDataJSON());
    on = true;
    return route.fulfill({ json: partner("b1", "branch", { activateChildren: true }) });
  });
  await page.route("**/api/admin/partners/tree?**", (route) =>
    route.fulfill({ json: { items: [partner("b1", "branch", { activateChildren: on })], page: 1, total: 1 } }),
  );
  await page.goto("/#partners");
  await page.getByRole("button", { name: "下级开通：关", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "开启下级小程序开通权限？" });
  await expect(dialog).toContainText("一级服务商、二级服务商和合伙人");
  await dialog.getByRole("button", { name: "开启", exact: true }).click();
  await expect(page.getByRole("button", { name: "下级开通：开", exact: true })).toBeVisible();
  expect(bodies).toEqual([{ enabled: true, version: 1 }]);
});

async function providerLogin(page: Page, canActivateChildren: boolean) {
  await mockLogin(page);
  await page.route("**/api/admin/me", (route) =>
    route.fulfill({
      json: {
        id: "provider-account",
        name: "服务商本人",
        role: "s1",
        scope: "partner",
        partnerId: "s1",
        menus: ["partners"],
        canActivateChildren,
      },
    }),
  );
}

const rows = [
  partner("s1", "s1", { activateChildren: true }),
  partner("child", "s2", { status: "pending", ownerUser: "u2", parentId: "s1", path: ["root", "s1"] }),
];

test("a provider with the switch on opens a pending child", async ({ page }) => {
  await providerLogin(page, true);
  const decisions: unknown[] = [];
  await page.route("**/api/admin/registrations/u2", (route) => {
    if (route.request().method() === "PUT") {
      decisions.push(route.request().postDataJSON());
      return route.fulfill({ json: { id: "u2", version: 4, data: {} } });
    }
    return route.fulfill({
      json: { id: "u2", version: 3, data: { role: "s2", partnerId: "child", status: "pending", name: "李四" } },
    });
  });
  await partners(page, rows);
  const row = page.locator(".provider-tree-row", { hasText: "浦东服务商" });
  await expect(row.getByRole("button", { name: "拒绝", exact: true })).toBeVisible();
  await row.getByRole("button", { name: "开通", exact: true }).click();
  await page.getByRole("dialog", { name: "开通登记" }).getByRole("button", { name: "开通", exact: true }).click();
  await expect.poll(() => decisions).toEqual([{ approve: true, reason: "", version: 3 }]);
  // Its own row offers the 合伙人登记 inbox.
  await expect(
    page.locator(".provider-tree-row", { hasText: "上海服务商" }).getByRole("button", { name: "合伙人登记", exact: true }),
  ).toBeVisible();
});

test("a provider with the switch off only sees that review is pending", async ({ page }) => {
  await providerLogin(page, false);
  await partners(page, rows);
  const row = page.locator(".provider-tree-row", { hasText: "浦东服务商" });
  await expect(row).toBeVisible();
  await expect(row.getByRole("button", { name: "开通", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "合伙人登记", exact: true })).toHaveCount(0);
});
