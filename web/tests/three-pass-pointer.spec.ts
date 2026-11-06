import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("dragging a selection out of a dialog does not dismiss it", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "模型管理", exact: true }).click();
  await page.getByRole("button", { name: "新增模型", exact: true }).click();
  const dialog = page.getByRole("dialog"),
    input = dialog.getByLabel("模型 ID", { exact: true });
  await input.fill("draft-model-id");
  const box = (await input.boundingBox())!;
  await page.mouse.move(box.x + 25, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(5, 5, { steps: 6 });
  await page.mouse.up();
  await expect(dialog).toBeVisible();
  await expect(input).toHaveValue("draft-model-id");
  await page.mouse.click(5, 5);
  await expect(dialog).toHaveCount(0);
});
