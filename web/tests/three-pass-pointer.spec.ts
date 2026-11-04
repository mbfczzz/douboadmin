import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import { surfaceFixtures } from "./surface-fixtures";

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

test("nested picker can repeatedly close without releasing the parent scroll lock", async ({
  page,
}) => {
  await login(page);
  await surfaceFixtures(page);
  await page.getByRole("button", { name: "小程序用户", exact: true }).click();
  await page.getByRole("button", { name: "服务商管理", exact: true }).click();
  await page.getByRole("tab", { name: "名额划拨", exact: true }).click();
  for (let i = 0; i < 4; i++) {
    await page
      .getByRole("button", { name: "划拨 / 收回名额", exact: true })
      .click();
    const parent = page.getByRole("dialog", {
      name: "名额划拨 / 收回",
      exact: true,
    });
    const opener = parent.getByRole("button", {
      name: "选择直接下级服务商",
      exact: true,
    });
    await opener.click();
    await expect(page.getByRole("dialog")).toHaveCount(2);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(opener).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe(
      "hidden",
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
      "hidden",
    );
  }
});
