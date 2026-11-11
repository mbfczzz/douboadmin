import type { Page } from "@playwright/test";
import { surfaceFixtures } from "./surface-fixtures";

export async function modalPartnerFixtures(page: Page) {
  await surfaceFixtures(page);
  // A root-level pending provider is reviewable by the platform itself.
  await page.route("**/api/admin/registrations?*", (route) => route.fulfill({ json: {
    page: 1, size: 20, total: 1, items: [{ id: "qa-user", version: 1, createdAt: "2026-11-11",
      data: { role: "branch", partnerId: "qa-pending", parentId: "root", canReview: true,
        codeKind: "bind", code: "ABCD2345", method: "scan", name: "待审核分公司", phone: "13900000002", status: "pending" } }],
  } }));
  const record = {
    id: "qa-child",
    version: 1,
    createdAt: "2026-11-06T00:00:00Z",
    data: {
      name: "质检下级服务商",
      role: "s1",
      parentId: "qa-provider",
      path: ["root", "qa-provider"],
      status: "active",
      retailPer100Fen: 10000,
      childMarginBps: 5000,
    },
  };
  await page.route("**/api/admin/partners?*", (route) =>
    route.fulfill({ json: { items: [record], page: 1, total: 1, size: 20 } }),
  );
  await page.route("**/api/admin/partners/qa-child", (route) =>
    route.fulfill({
      json: {
        record,
        price: { shares: [] },
        commission: { balanceFen: 0, heldFen: 0, paidOutFen: 0 },
      },
    }),
  );
}
