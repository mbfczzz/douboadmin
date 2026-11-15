import { test, expect } from "@playwright/test";
import { modelPage, openModels } from "./model-tab-fixture";

for (const width of [1440, 390]) {
  test(`model order supports drag, filtered slots, confirmation and persistence at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    let rows = Array.from({ length: 25 }, (_, i) => {
      const row = modelPage(i === 1 ? "video" : "image").items[0];
      const id = `model-${String(i).padStart(2, "0")}`;
      return {
        ...row,
        id,
        data: { ...row.data, id, name: `模型${i}`, sort: i + 1 },
      };
    });
    let writes = 0;
    await openModels(page, (route) =>
      route.fulfill({
        json: {
          ...modelPage("image"),
          total: rows.length,
          items: rows.slice(0, 20),
        },
      }),
    );
    await page.route("**/api/admin/models", (route) =>
      route.fulfill({ json: rows }),
    );
    await page.route("**/api/admin/models/order", (route) => {
      const items = route.request().postDataJSON().items;
      expect(items).toHaveLength(25);
      expect(items[0].id).toBe("model-02");
      expect(items[1].id).toBe("model-01"); // Video keeps its slot while images move.
      expect(items[2].id).toBe("model-00");
      expect(items[0].version).toBe(1);
      expect(items[0].createdAt).toBe(rows[0].createdAt);
      rows = items.map((item: { id: string }, i: number) => {
        const row = rows.find((r) => r.id === item.id)!;
        return {
          ...row,
          version: row.version + 1,
          data: { ...row.data, sort: i + 1 },
        };
      });
      writes++;
      return route.fulfill({ json: { ok: true } });
    });
    await page.getByRole("button", { name: "拖动排序", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "模型排序", exact: true });
    await expect(dialog.locator("li")).toHaveCount(25);
    await expect(
      dialog.getByRole("button", { name: "保存排序", exact: true }),
    ).toBeDisabled();
    await dialog.getByLabel("排序模型类型").selectOption("image");
    await expect(dialog.locator("li")).toHaveCount(24);
    const handle = dialog.getByRole("button", {
      name: "拖动 模型2",
      exact: true,
    });
    await handle.dragTo(dialog.locator('[data-model-id="model-00"]'));
    await expect(dialog.locator("li").first()).toHaveAttribute(
      "data-model-id",
      "model-02",
    );
    await dialog.getByRole("button", { name: "保存排序", exact: true }).click();
    const confirmation = page.getByRole("dialog", {
      name: "保存模型排序？",
      exact: true,
    });
    expect(writes).toBe(0);
    await confirmation
      .getByRole("button", { name: "取消", exact: true })
      .click();
    expect(writes).toBe(0);
    // Keyboard/touch-accessible buttons work too, without submitting changes.
    await dialog
      .getByRole("button", { name: "下移 模型2", exact: true })
      .click();
    await expect(dialog.locator("li").first()).toHaveAttribute(
      "data-model-id",
      "model-00",
    );
    await dialog
      .getByRole("button", { name: "上移 模型2", exact: true })
      .click();
    await page.screenshot({ path: `../.runtime/model-order-${width}.png` });
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await dialog.getByRole("button", { name: "保存排序", exact: true }).click();
    await confirmation
      .getByRole("button", { name: "确认保存", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    expect(writes).toBe(1);
    await expect(page.locator("tbody tr").first()).toContainText("模型2");
    await page.getByRole("button", { name: "拖动排序", exact: true }).click();
    await expect(dialog.locator("li").first()).toHaveAttribute(
      "data-model-id",
      "model-02",
    );
  });
}

test("conflicting reorder keeps the draft and allows reload without claiming success", async ({
  page,
}) => {
  const rows = [modelPage("image").items[0], modelPage("video").items[0]];
  await openModels(page, (route) =>
    route.fulfill({ json: { ...modelPage("image"), total: 2, items: rows } }),
  );
  await page.route("**/api/admin/models", (route) =>
    route.fulfill({ json: rows }),
  );
  await page.route("**/api/admin/models/order", (route) =>
    route.fulfill({
      status: 409,
      json: { error: "模型已变更" },
    }),
  );
  await page.getByRole("button", { name: "拖动排序", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "模型排序", exact: true });
  await dialog
    .getByRole("button", { name: "上移 视频模型条目", exact: true })
    .click();
  await dialog.getByRole("button", { name: "保存排序", exact: true }).click();
  await page.getByRole("button", { name: "确认保存", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("模型已变更");
  await expect(dialog.locator("li").first()).toHaveAttribute(
    "data-model-id",
    "video-model",
  );
  await dialog.getByRole("button", { name: "重新加载", exact: true }).click();
  await expect(dialog.locator("li").first()).toHaveAttribute(
    "data-model-id",
    "image-model",
  );
  await expect(
    dialog.getByRole("button", { name: "保存排序", exact: true }),
  ).toBeDisabled();
});
