import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("template editor keeps save and close visible while the fields scroll", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "创作模板", exact: true }).click();
  await page.getByRole("button", { name: "新增模板", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 720 });
  const dialog = page.getByRole("dialog"),
    body = dialog.locator(".form-body");
  const save = dialog.getByRole("button", { name: "保存模板", exact: true });
  const first = await save.boundingBox();
  expect(first!.y + first!.height).toBeLessThan(720);
  await body.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect((await save.boundingBox())!.y).toBe(first!.y);
  await expect(
    dialog.getByRole("button", { name: "关闭", exact: true }),
  ).toBeInViewport();
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(save).toBeInViewport();
  expect(
    await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBeTruthy();
});

test("mobile user actions stay accessible and failed balances remain unknown", async ({
  page,
}) => {
  await login(page);
  await page.route("**/api/admin/users", (route) =>
    route.fulfill({
      json: [
        {
          id: "ui-polish-user",
          version: 1,
          createdAt: "2026-11-01T00:00:00Z",
          data: { nickname: "测试用户", name: "", phone: "" },
        },
      ],
    }),
  );
  let failed = true;
  await page.route("**/api/admin/users/ui-polish-user/wallet", (route) =>
    route.fulfill(
      failed
        ? { status: 503, json: { error: "余额暂不可用" } }
        : { json: { wallet: { availableUnits: 12345, heldUnits: 200 } } },
    ),
  );
  await page.route("**/api/admin/users/ui-polish-user/ledger", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.getByRole("button", { name: "小程序用户", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const action = page.getByRole("button", { name: "详情", exact: true });
  await action.scrollIntoViewIfNeeded();
  await expect(action).toBeInViewport();
  const before = await action.boundingBox();
  expect(before!.width).toBeGreaterThanOrEqual(44);
  expect(before!.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator(".record-table > .table-scroll")).toHaveCount(0);
  expect(Math.abs((await action.boundingBox())!.x - before!.x)).toBeLessThan(2);
  await action.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.locator(".business-metrics strong")).toHaveText([
    "—",
    "—",
  ]);
  failed = false;
  await dialog.getByRole("button", { name: "重试", exact: true }).click();
  await expect(dialog.locator(".business-metrics strong")).toHaveText([
    "123.45",
    "2",
  ]);
  // Details are read-only; changes live in the row actions.
  await expect(
    dialog.getByRole("button", { name: "停用账号", exact: true }),
  ).toHaveCount(0);
});
