import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("quote management pages load real APIs and report missing services", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  for (const name of [
    "充值订单",
    "支付管理",
    "作品管理",
    "内容审核",
    "背景音乐",
    "运行监控",
    "系统设置",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
  await expect(page.getByText(/微信支付：待配置/)).toBeVisible();
  await page.getByRole("button", { name: "运行监控", exact: true }).click();
  await expect(page.getByText("在线", { exact: true }).first()).toBeVisible();
  await page.screenshot({
    path: "../.runtime/quote-monitor.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("admin adjusts points with an immutable visible ledger", async ({
  page,
}) => {
  const id = process.env.QUOTE_TEST_USER_ID;
  test.skip(!id, "Provide a local temporary QA user id");
  await login(page);
  await page.getByRole("button", { name: "用户管理", exact: true }).click();
  await page.getByLabel("搜索用户").fill(id!);
  await page
    .locator("tbody tr")
    .getByRole("button", { name: "详情 / 积分", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("积分变动（负数为扣减）").fill("12.5");
  await dialog.getByLabel("操作原因").fill("浏览器验收临时积分");
  await dialog
    .getByRole("button", { name: "确认调整积分", exact: true })
    .click();
  await expect(
    dialog.getByText("浏览器验收临时积分", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText("12.5", { exact: true }).first()).toBeVisible();
  await page.screenshot({
    path: "../.runtime/quote-user-ledger.png",
    fullPage: true,
  });
});
