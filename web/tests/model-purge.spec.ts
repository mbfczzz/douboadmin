import { test, expect } from "@playwright/test";
import { modelPage, openModels } from "./model-tab-fixture";

for (const width of [1440, 390]) {
  test(`permanent deletion is explicit and refreshes the deleted list at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const row = { ...modelPage("image").items[0], version: 4 };
    let removed = false;
    const writes: unknown[] = [];
    await openModels(page, (route) => {
      const deleted =
        new URL(route.request().url()).searchParams.get("deleted") === "true";
      return route.fulfill({
        json: {
          ...modelPage("image"),
          total: removed ? 0 : 1,
          items: removed
            ? []
            : [{ ...row, data: { ...row.data, deleted, published: !deleted } }],
        },
      });
    });
    await page.route("**/api/admin/models/image-model/permanent", (route) => {
      writes.push(route.request().postDataJSON());
      expect(route.request().method()).toBe("DELETE");
      removed = true;
      return route.fulfill({ json: { ok: true } });
    });
    await expect(
      page.getByRole("button", { name: "彻底删除", exact: true }),
    ).toHaveCount(0);
    await page.getByLabel("模型范围").selectOption("deleted");
    await page.getByRole("button", { name: "彻底删除", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "彻底删除模型？",
      exact: true,
    });
    await expect(dialog).toContainText("无法恢复");
    await expect(dialog).toContainText("可能按默认配置重新导入");
    expect(writes).toHaveLength(0);
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    expect(writes).toHaveLength(0);
    await page.getByRole("button", { name: "彻底删除", exact: true }).click();
    await dialog.getByRole("button", { name: "彻底删除", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByText("模型已彻底删除，原配置不可恢复", { exact: true }),
    ).toBeVisible();
    expect(writes).toEqual([
      { version: row.version, createdAt: row.createdAt },
    ]);
    await expect(page.getByText(row.data.name, { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "恢复模型", exact: true }),
    ).toHaveCount(0);
  });
}
