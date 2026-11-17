import { expect, test } from "@playwright/test";
import { modelPage, openModels } from "./model-tab-fixture";
import { confirmSubmission } from "./helpers";

test("model identifiers stay out of the catalog but are read-only in the editor", async ({ page }) => {
  const data = modelPage("image");
  const original = data.items[0];
  let saved: typeof original.data | undefined;
  await openModels(page, (route) => route.fulfill({ json: data }));
  await page.route("**/api/admin/models/image-model", (route) => {
    saved = route.request().postDataJSON().data;
    return route.fulfill({ json: { ...original, data: saved, version: 2 } });
  });
  await expect(page.locator("tbody")).toContainText(original.data.name);
  await expect(page.locator("tbody")).not.toContainText(original.data.key);
  await page.getByRole("button", { name: "基础信息", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const id = dialog.getByLabel("模型 ID", { exact: true });
  await expect(id).toHaveValue(original.data.key);
  await expect(id).toHaveAttribute("readonly", "");
  await dialog.getByLabel("名称", { exact: true }).fill("新的展示名称");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".save-confirmation")).not.toContainText(original.data.key);
  await confirmSubmission(page);
  await expect(dialog).toHaveCount(0);
  expect(saved?.name).toBe("新的展示名称");
  expect(saved?.key).toBe(original.data.key);
  expect(saved?.id).toBe(original.data.id);
});
