import { test, expect } from "@playwright/test";
import { answerAsk, confirmSubmission, login } from "./helpers";

test("admin account row actions each do one thing", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "管理账号", exact: true }).click();
  const username = "actions-" + Date.now();

  // Creating from the UI must succeed (it used to send an unknown field).
  await page.getByRole("button", { name: "添加管理账号", exact: true }).click();
  const form = page.getByRole("dialog", { name: "添加管理账号" });
  await form.getByLabel("登录账号").fill(username);
  await form.getByLabel("姓名", { exact: true }).fill("行操作验收");
  await form.getByLabel("初始密码").fill("Tt9b763a");
  const created = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/admin/accounts" &&
      r.request().method() === "POST",
  );
  await form.getByRole("button", { name: "创建账号" }).click();
  expect((await created).status()).toBe(201);
  await expect(form).toHaveCount(0);

  const row = page.locator("tbody tr").filter({ hasText: username });
  await expect(row.getByRole("button")).toHaveText([
    "编辑",
    "重置密码",
    "停用",
    "归档",
  ]);
  await expect(row).toContainText("尚未登录");

  await row.getByRole("button", { name: "停用", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "停用管理账号" }),
  ).toContainText("停用");
  await confirmSubmission(page);
  await expect(row).toContainText("已停用");
  await row.getByRole("button", { name: "启用", exact: true }).click();
  await confirmSubmission(page);
  await expect(row).toContainText("正常");

  await row.getByRole("button", { name: "归档", exact: true }).click();
  await answerAsk(page, true);
  await expect(row).toHaveCount(0);
});
