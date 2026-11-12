import { test, expect } from "@playwright/test";
import { login, answerAsk } from "./helpers";

test("browser back respects the editor discard confirmation", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "创作模板", exact: true }).click();
  await page.getByRole("button", { name: "新增视频模板", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("模板名称").fill("返回时保留的草稿");
  await page.goBack();
  await answerAsk(page, false);
  await expect(page).toHaveURL(/#templates$/);
  await expect(dialog.getByLabel("模板名称")).toHaveValue("返回时保留的草稿");
  await page.goBack();
  await answerAsk(page, true);
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/#templates$/);
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "工作概览", exact: true }),
  ).toBeVisible();
});
