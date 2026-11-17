import { expect, test } from "@playwright/test";
import { mockLogin } from "./mock-login";

for (const width of [1440, 390]) {
  test(`FlowLight import previews first and creates only approved video drafts at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockLogin(page);
    await page.route("**/api/admin/models", (route) =>
      route.fulfill({ json: [] }),
    );
    await page.route("**/api/admin/templates/categories", (route) =>
      route.fulfill({ json: [] }),
    );
    await page.route("**/api/admin/templates?*", (route) =>
      route.fulfill({ json: { items: [], total: 0, page: 1, size: 12 } }),
    );
    let previews = 0,
      writes = 0;
    const items = [
      {
        sourceId: "video",
        title: "完整视频配方",
        action: "create",
        chars: 5500,
        images: 6,
        required: 2,
      },
      {
        sourceId: "photo",
        title: "图片模板",
        action: "skip",
        reason: "当前仅支持视频",
        chars: 30,
        images: 1,
        required: 1,
      },
    ];
    await page.route("**/api/admin/templates/import-preview", (route) => {
      previews++;
      const body = route.request().postDataJSON();
      expect(body.publish).toBe(false);
      expect(body.pack.templates[0].prompt.length).toBe(5500);
      return route.fulfill({
        json: {
          total: 2,
          applied: false,
          counts: { create: 1, skip: 1 },
          items,
        },
      });
    });
    await page.route("**/api/admin/templates/import", (route) => {
      writes++;
      expect(route.request().postDataJSON().publish).toBe(false);
      return route.fulfill({
        json: {
          total: 2,
          applied: true,
          counts: { imported: 1, skip: 1 },
          items: items.map((i) => ({
            ...i,
            action: i.action === "create" ? "imported" : i.action,
          })),
        },
      });
    });
    await page.goto("/#templates");
    await page.getByRole("button", { name: "导入模板", exact: true }).click();
    const modal = page.getByRole("dialog", {
      name: "从 FlowLight 导入模板",
      exact: true,
    });
    const pack = {
      format: "flowlight.studio-templates",
      schemaVersion: 1,
      total: 2,
      templates: [{ id: "video", prompt: "字".repeat(5500) }, { id: "photo" }],
    };
    await modal
      .locator('input[type="file"]')
      .setInputFiles({
        name: "flowlight.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(pack)),
      });
    await expect(modal).toContainText("待导入 1");
    await expect(modal).toContainText("跳过图片 1");
    expect(previews).toBe(1);
    expect(writes).toBe(0);
    await expect(modal.getByRole("checkbox")).not.toBeChecked();
    await page.screenshot({ path: `../.runtime/template-import-${width}.png` });
    await modal
      .getByRole("button", { name: "导入已通过的模板", exact: true })
      .click();
    await expect(modal).toContainText("已导入 1");
    expect(writes).toBe(1);
    await expect(
      modal.getByRole("button", { name: "导入已通过的模板", exact: true }),
    ).toBeDisabled();
    await modal
      .getByRole("button", { name: "关闭", exact: true })
      .last()
      .click();
    await expect(modal).toHaveCount(0);
  });
}

test("old import API gives deployment guidance and never writes templates", async ({
  page,
}) => {
  await mockLogin(page);
  await page.route("**/api/admin/models", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/admin/templates/categories", (r) =>
    r.fulfill({ json: [] }),
  );
  await page.route("**/api/admin/templates?*", (r) =>
    r.fulfill({ json: { items: [], total: 0, page: 1, size: 12 } }),
  );
  await page.route("**/api/admin/templates/import-preview", (r) =>
    r.fulfill({ status: 405, body: "Method Not Allowed" }),
  );
  await page.goto("/#templates");
  await page.getByRole("button", { name: "导入模板", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "从 FlowLight 导入模板" });
  await modal
    .locator('input[type="file"]')
    .setInputFiles({
      name: "templates.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"format":"flowlight.studio-templates"}'),
    });
  await expect(modal.getByRole("alert")).toContainText("请先部署新版 API");
  await expect(
    modal.getByRole("button", { name: "导入已通过的模板", exact: true }),
  ).toBeDisabled();
});
