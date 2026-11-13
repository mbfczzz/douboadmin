import { expect, test } from "@playwright/test";
import { mockLogin } from "./mock-login";

for (const width of [1600, 1280, 1000, 390, 320]) {
  test(`all provider actions stay inside the list at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockLogin(page);
    await page.route("**/api/admin/partners/tree?*", r => {
      const parent = new URL(r.request().url()).searchParams.get("parent");
      const names = parent ? ["下级服务商"] : ["华东分公司", "LongProviderNameWithoutSpaces".repeat(3), "测试服务商", "测试分公司", "服务商一", "服务商二"];
      return r.fulfill({ json: { page: 1, total: names.length, items: names.map((name, i) => ({
        id: parent ? "child" : `branch-${i}`, version: 1, children: !parent && i === 0 ? 1 : 0,
        data: { name, status: "active", role: parent ? "s1" : "branch", parentId: parent || "root", path: parent ? ["root", parent] : ["root"] },
      })) } });
    });
    await page.goto("/#partners");
    await page.getByRole("button", { name: "展开华东分公司", exact: true }).click();
    await expect(page.locator(".provider-tree-row")).toHaveCount(7);
    const geometry = await page.locator(".provider-tree").evaluate(tree => {
      const bounds = tree.getBoundingClientRect();
      const rows = [...tree.querySelectorAll(".provider-tree-row")];
      const failures: string[] = [];
      for (const row of rows) {
        const box = row.getBoundingClientRect();
        for (const button of row.querySelectorAll(".provider-tree-actions button")) {
          const b = button.getBoundingClientRect();
          if (b.left < bounds.left || b.right > bounds.right - 4 || b.top < box.top || b.bottom > box.bottom) failures.push(button.textContent || "button");
        }
        if (row.scrollWidth > row.clientWidth + 1) failures.push("row overflow");
      }
      const first = rows[0];
      const name = first.querySelector(".provider-tree-name")!.getBoundingClientRect();
      const actions = first.querySelector(".provider-tree-actions")!.getBoundingClientRect();
      return { failures, pageOverflow: document.documentElement.scrollWidth > innerWidth, nameWidth: name.width, actionWidth: actions.width, sameRow: Math.abs(name.top - actions.top) < 60 };
    });
    expect(geometry.failures).toEqual([]);
    expect(geometry.pageOverflow).toBe(false);
    if (width === 1600) expect(geometry.actionWidth).toBeGreaterThan(geometry.nameWidth);
    const remove = page.locator(".provider-tree-row").first().getByRole("button", { name: "删除", exact: true });
    await remove.scrollIntoViewIfNeeded();
    expect(await remove.evaluate(button => {
      const b = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2));
    })).toBe(true);
    await page.screenshot({ path: `../.runtime/provider-list-layout-${width}.png`, fullPage: true, animations: "disabled" });
  });
}
