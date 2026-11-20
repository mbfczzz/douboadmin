import { test, expect } from "@playwright/test";
import { confirmSubmission, login } from "./helpers";

// 试衣服装: upload a picture, name it, publish it, then take it down.
test("an outfit is added with its picture, published and taken down", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "试衣服装", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "试衣服装", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "新增服装" }).click();
  const dialog = page.getByRole("dialog", { name: "新增服装" });
  const save = dialog.getByRole("button", { name: "保存服装" });
  await expect(save).toBeDisabled(); // no picture yet
  const title = "测试服装 " + Date.now();
  await dialog.getByLabel("服装名称").fill(title);
  await dialog
    .getByLabel("上传服装图片")
    .setInputFiles("../media/design/cover-1.jpg");
  await expect(dialog.getByAltText("服装图片预览")).toBeVisible();
  await dialog.getByLabel("分类").fill("春季");
  await dialog.getByLabel("描述").fill("白色衬衫 + 牛仔裤");
  await dialog.getByLabel("保存后上架到小程序").check();
  await save.click();
  await confirmSubmission(page);
  const card = page.locator("article.studio-card", { hasText: title });
  await expect(card).toBeVisible();
  await expect(card.getByText("已上架")).toBeVisible();
  await expect(card.getByRole("img", { name: title })).toBeVisible();
  await card.getByRole("button", { name: "下架" }).click();
  await confirmSubmission(page);
  await expect(card.getByText("草稿")).toBeVisible();
});
