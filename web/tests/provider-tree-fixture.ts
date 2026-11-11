import { expect, type Page } from "@playwright/test";
import { pagedFixture } from "./paged-fixture";

type Provider = { id: string; data: { name: string; parentId: string } };

// Match the paginated lazy tree contract, rather than the retired flat endpoint.
export async function providerTreeFixture(page: Page, rows: Provider[], root?: string) {
  await page.route("**/api/admin/partners/tree?*", (route) => {
    const url = new URL(route.request().url());
    const parent = url.searchParams.get("parent"), q = url.searchParams.get("q") || "";
    const found = rows.filter((row) => q ? (row.id+" "+row.data.name).includes(q) :
      parent ? row.data.parentId === parent : root ? row.id === root : row.data.parentId === "root");
    return route.fulfill({ json: pagedFixture(found.map((row) => ({
      ...row, children: rows.filter((child) => child.data.parentId === row.id).length,
    })), url) });
  });
}

export async function expandProviderTree(page: Page, expected: number) {
  const rows = page.locator(".provider-tree-row");
  for (let attempt = 0; attempt < 20 && await rows.count() < expected; attempt++) {
    const before = await rows.count();
    await page.locator('.tree-toggle[aria-label^="展开"]').first().click();
    await expect.poll(() => rows.count()).toBeGreaterThan(before);
  }
  await expect(rows).toHaveCount(expected);
}
