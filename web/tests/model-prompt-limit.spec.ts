import { expect, test } from "@playwright/test";
import { modelPage, openModels } from "./model-tab-fixture";
import { confirmSubmission } from "./helpers";
import type { Model, Row } from "../src/api";

for (const [kind, defaultLimit, customLimit] of [
  ["image", 2000, 4000],
  ["video", 20000, 30000],
] as const) {
  test(`${kind}: prompt defaults, longer text and custom limits persist`, async ({ page }) => {
    let row = modelPage(kind).items[0] as Row<Model>;
    const saved: Model[] = [];
    await openModels(page, (route) => route.fulfill({
      json: { ...modelPage(kind), items: [row] },
    }));
    await page.route(`**/api/admin/models/${row.id}`, async (route) => {
      if (route.request().method() === "PUT") {
        const body = route.request().postDataJSON();
        saved.push(body.data);
        row = { ...row, version: row.version + 1, data: body.data };
      }
      await route.fulfill({ json: row });
    });
    const open = async () => {
      await page.getByRole("button", { name: "提示词", exact: true }).click();
      return page.getByRole("dialog", { name: /^提示词配置 ·/ });
    };
    let dialog = await open();
    await expect(dialog.getByLabel("最大提示词字数", { exact: true })).toHaveValue(String(defaultLimit));
    await expect(dialog.getByRole("textbox", { name: "默认提示词", exact: true })).toHaveAttribute("maxlength", String(defaultLimit));
    await dialog.getByLabel("最大提示词字数", { exact: true }).fill(String(customLimit));
    const prompt = "窗边电影镜头".repeat(150);
    await dialog.getByRole("textbox", { name: "默认提示词", exact: true }).fill(prompt);
    await dialog.getByRole("button", { name: "添加灵感词", exact: true }).click();
    await dialog.getByLabel("灵感提示词 1", { exact: true }).fill(prompt);
    await dialog.getByRole("button", { name: "保存", exact: true }).click();
    await confirmSubmission(page);
    await expect(dialog).toHaveCount(0);
    expect(saved[0].settings?.maxPromptChars).toBe(customLimit);
    expect(saved[0].settings?.defaultPrompt).toBe(prompt);
    expect(saved[0].settings?.ideas).toEqual([prompt]);
    dialog = await open();
    await expect(dialog.getByLabel("最大提示词字数", { exact: true })).toHaveValue(String(customLimit));
    await dialog.getByLabel("最大提示词字数", { exact: true }).fill("0");
    await expect(dialog.getByLabel("最大提示词字数", { exact: true })).toHaveValue(String(defaultLimit));
    await dialog.getByRole("button", { name: "保存", exact: true }).click();
    await confirmSubmission(page);
    await expect(dialog).toHaveCount(0);
    expect(saved[1].settings?.maxPromptChars).toBe(0);
    dialog = await open();
    await expect(dialog.getByLabel("最大提示词字数", { exact: true })).toHaveValue(String(defaultLimit));
    await expect(dialog.getByRole("textbox", { name: "默认提示词", exact: true })).toHaveValue(prompt);
  });
}
