import { expect, type Page } from "@playwright/test";
import { mockLogin } from "./mock-login";
import { qr } from "./surface-fixtures";

export const titles = {
  s1: "S1 服务商邀请码",
  s2: "S2 推荐官邀请码",
  member: "子账号开通码",
};
export const codes = {
  s1: "KMNP2345",
  s2: "WXYZ6789",
  member: "ABCD2345",
  bind: "BIND2345",
};

export async function openCodes(
  page: Page,
  role = "branch",
  unbound = false,
  self = false,
) {
  await mockLogin(page);
  if (self)
    await page.route("**/api/admin/me", (route) =>
      route.fulfill({
        json: {
          id: "provider-account",
          name: "服务商本人",
          role: "provider",
          scope: "partner",
          partnerId: "code-provider",
          menus: ["partners"],
        },
      }),
    );
  const row = {
    id: "code-provider",
    version: 1,
    createdAt: "2026-11-10T00:00:00Z",
    children: 0,
    data: {
      name:
        role === "branch"
          ? "华东分公司"
          : role === "s1"
            ? "上海服务商"
            : "浦东推荐官",
      role,
      parentId: "root",
      path: [],
      status: "active",
      retailPer100Fen: 10000,
      childMarginBps: 5000,
      ownerUser: unbound ? undefined : "owner-user",
    },
  };
  await page.route("**/api/admin/partners/tree?**", (route) =>
    route.fulfill({ json: { items: [row], page: 1, total: 1 } }),
  );
  await page.route("**/api/admin/partners/code-provider", (route) =>
    route.fulfill({
      json: {
        record: row,
        price: { shares: [] },
        commission: { balanceFen: 0, heldFen: 0, paidOutFen: 0 },
      },
    }),
  );
  await page.route("**/api/admin/memberships?**", (route) =>
    route.fulfill({ json: { items: [], page: 1, size: 20, total: 0 } }),
  );
  const requests: string[] = [];
  await page.route("**/api/admin/partners/code-provider/code-uses?*", (route) =>
    route.fulfill({ json: { items: [], page: 1, size: 20, total: 0 } }),
  );
  await page.route("**/api/admin/partners/code-provider/codes/*", (route) => {
    const kind = new URL(route.request().url()).pathname
      .split("/")
      .pop() as keyof typeof codes;
    requests.push(`${route.request().method()}:${kind}`);
    return route.fulfill({ json: { code: codes[kind], qr } });
  });
  await page.goto("/#partners");
  if (self) await page.reload();
  await page.getByRole("button", { name: "分享码", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "分享码", exact: true });
  await expect(dialog.locator(".share-qr")).toBeVisible();
  return { dialog, requests, row };
}
