import { expect, test } from "@playwright/test";
import { modelPage, openModels } from "./model-tab-fixture";
import { confirmSubmission } from "./helpers";

for (const width of [1440, 390]) {
  test(`deleted models remain visible for explicit restoration at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    let deleted = true;
    const writes: unknown[] = [];
    const row = { ...modelPage("video").items[0], version: 7 };
    await openModels(page, (route) => {
      const query = new URL(route.request().url()).searchParams;
      const visible = (query.get("deleted") === "true") === deleted;
      return route.fulfill({
        json: {
          ...modelPage("video"),
          total: visible ? 1 : 0,
          items: visible
            ? [{ ...row, data: { ...row.data, deleted, published: !deleted } }]
            : [],
        },
      });
    });
    await page.route("**/api/admin/models/sync", (route) =>
      route.fulfill({
        json: { created: 0, updated: 23, hidden: 23, conflicts: 0 },
      }),
    );
    await page.route("**/api/admin/models", (route) => {
      writes.push(route.request().postDataJSON());
      deleted = false;
      return route.fulfill({
        json: { ...row, version: 8, data: { ...row.data, deleted: false } },
      });
    });
    await expect(page.getByText("还没有模型", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "同步上游", exact: true }).click();
    await confirmSubmission(page);
    await expect(page.getByText(/23 个已删除模型保持隐藏/)).toBeVisible();
    await page.getByLabel("模型范围", { exact: true }).selectOption("deleted");
    await expect(page.getByText("视频模型条目", { exact: true })).toBeVisible();
    await expect(page.getByRole("switch")).toHaveCount(0);
    await expect(
      page.locator("tbody").getByRole("button", { name: "删除", exact: true }),
    ).toHaveCount(0);
    await page.screenshot({ path: `../.runtime/model-recovery-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "恢复模型", exact: true }).click();
    const confirm = page.getByRole("dialog", {
      name: "恢复模型？",
      exact: true,
    });
    await expect(confirm).toContainText("保留原名称、定价和配置");
    expect(writes).toHaveLength(0);
    await confirm.getByRole("button", { name: "取消", exact: true }).click();
    expect(writes).toHaveLength(0);
    await page.getByRole("button", { name: "恢复模型", exact: true }).click();
    await confirm
      .getByRole("button", { name: "恢复模型", exact: true })
      .click();
    await expect(confirm).toHaveCount(0);
    await expect(
      page.getByText("模型已恢复，可切换到当前模型查看", { exact: true }),
    ).toBeVisible();
    expect(writes).toEqual([{ key: "video-fixture", version: 7 }]);
    await expect(page.getByText("视频模型条目", { exact: true })).toHaveCount(
      0,
    );
    await page.getByLabel("模型范围", { exact: true }).selectOption("current");
    await expect(page.getByText("视频模型条目", { exact: true })).toBeVisible();
    await expect(page.getByRole("switch")).toBeChecked();
    const size = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(size.scroll).toBeLessThanOrEqual(size.client);
  });
}
