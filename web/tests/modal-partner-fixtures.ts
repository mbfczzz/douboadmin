import type { Page } from "@playwright/test";
import { surfaceFixtures } from "./surface-fixtures";

export async function modalPartnerFixtures(page: Page) {
  await surfaceFixtures(page);
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
