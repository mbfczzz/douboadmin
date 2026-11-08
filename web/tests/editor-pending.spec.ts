import { test, expect } from "@playwright/test";
import { confirmSubmission, login } from "./helpers";

test("model fields cannot change while a save is pending; failure preserves the draft", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "模型管理", exact: true }).click();
  await page.getByRole("button", { name: "配置", exact: true }).first().click();
  const dialog = page.getByRole("dialog"),
    name = dialog.getByLabel("名称", { exact: true });
  await name.fill("待保存的模型名称");
  let release!: () => void,
    submitted = false;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/admin/models/*", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    submitted = true;
    await pending;
    await route.fulfill({ status: 503, json: { error: "测试保存失败" } });
  });
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await confirmSubmission(page);
  await expect.poll(() => submitted).toBeTruthy();
  try {
    await expect(name).toBeDisabled();
  } finally {
    release();
  }
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(name).toBeEnabled();
  await expect(name).toHaveValue("待保存的模型名称");
});
