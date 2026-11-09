import { test, expect } from "@playwright/test";
import { confirmSubmission, login } from "./helpers";
import { surfaceFixtures } from "./surface-fixtures";

test("pending point adjustment locks the submitted fields and preserves failed input", async ({
  page,
}) => {
  await login(page);
  await surfaceFixtures(page);
  await page.getByRole("button", { name: "小程序用户", exact: true }).click();
  await page.getByRole("button", { name: "积分", exact: true }).click();
  const dialog = page.getByRole("dialog"),
    amount = dialog.getByLabel("积分变动（负数为扣减）"),
    note = dialog.getByLabel("操作原因");
  await amount.fill("10");
  await note.fill("质检输入");
  let release!: () => void,
    sent = false;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/admin/users/qa-user/wallet", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    sent = true;
    await pending;
    await route.fulfill({ status: 503, json: { error: "测试提交失败" } });
  });
  await dialog
    .getByRole("button", { name: "确认调整积分", exact: true })
    .click();
  await confirmSubmission(page);
  await expect.poll(() => sent).toBeTruthy();
  try {
    await expect(amount).toBeDisabled();
    await expect(note).toBeDisabled();
  } finally {
    release();
  }
  await expect(amount).toBeEnabled();
  await expect(amount).toHaveValue("10");
  await expect(note).toHaveValue("质检输入");
});
