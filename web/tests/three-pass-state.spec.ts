import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import { surfaceFixtures } from "./surface-fixtures";

test("pending point adjustment locks the submitted fields and preserves failed input", async ({
  page,
}) => {
  await login(page);
  await surfaceFixtures(page);
  await page.getByRole("button", { name: "用户管理", exact: true }).click();
  await page.getByRole("button", { name: "详情 / 积分", exact: true }).click();
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

test("commission policy draft survives a cancelled tab or back action", async ({
  page,
}) => {
  await login(page);
  await surfaceFixtures(page);
  await page.getByRole("button", { name: "用户管理", exact: true }).click();
  await page.getByRole("button", { name: "服务商与授权", exact: true }).click();
  await page.getByRole("tab", { name: "算力分佣", exact: true }).click();
  const cost = page.getByLabel("每 100 元基准算力成本（元）", { exact: true });
  await cost.fill("75");
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("tab", { name: "下级服务商", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "算力分佣", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(cost).toHaveValue("75");
  await page.getByRole("button", { name: "切换服务商", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "切换服务商", exact: true });
  page.once("dialog", (d) => d.dismiss());
  await picker
    .getByRole("button", { name: "选择", exact: true })
    .first()
    .click();
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(cost).toHaveValue("75");
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "返回用户列表", exact: true }).click();
  await expect(cost).toHaveValue("75");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("tab", { name: "下级服务商", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "直接下级服务商", exact: true }),
  ).toBeVisible();
});

test("commission save locks inputs and a failed save keeps the draft", async ({
  page,
}) => {
  await login(page);
  await surfaceFixtures(page);
  await page.getByRole("button", { name: "用户管理", exact: true }).click();
  await page.getByRole("button", { name: "服务商与授权", exact: true }).click();
  await page.getByRole("tab", { name: "算力分佣", exact: true }).click();
  const cost = page.getByLabel("每 100 元基准算力成本（元）", { exact: true });
  await cost.fill("75");
  let release!: () => void,
    sent = false;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/admin/partner-policy", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    sent = true;
    await pending;
    await route.fulfill({ status: 503, json: { error: "测试保存失败" } });
  });
  await page.getByRole("button", { name: "保存分佣规则", exact: true }).click();
  await expect.poll(() => sent).toBeTruthy();
  try {
    await expect(cost).toBeDisabled();
    await page.getByRole("tab", { name: "下级服务商", exact: true }).click();
    await expect(
      page.getByRole("tab", { name: "算力分佣", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
  } finally {
    release();
  }
  await expect(cost).toBeEnabled();
  await expect(cost).toHaveValue("75");
  await expect(page.locator("form[data-unsaved]")).toHaveCount(1);
});

test("a successful commission save clears the unsaved marker", async ({
  page,
}) => {
  await login(page);
  await surfaceFixtures(page);
  let saved = false;
  await page.route("**/api/admin/partner-policy", async (route) => {
    if (route.request().method() === "PUT") {
      expect(route.request().postDataJSON().data.costPer100Fen).toBe(7500);
      saved = true;
    }
    await route.fulfill({
      json: {
        id: "distribution",
        version: saved ? 2 : 1,
        createdAt: "",
        data: {
          enabled: true,
          costPer100Fen: saved ? 7500 : 8000,
          rootMarginBps: 5000,
        },
      },
    });
  });
  await page.getByRole("button", { name: "用户管理", exact: true }).click();
  await page.getByRole("button", { name: "服务商与授权", exact: true }).click();
  await page.getByRole("tab", { name: "算力分佣", exact: true }).click();
  const cost = page.getByLabel("每 100 元基准算力成本（元）", { exact: true });
  await cost.fill("75");
  await page.getByRole("button", { name: "保存分佣规则", exact: true }).click();
  await expect(
    page.getByText("价格规则已保存，历史订单快照不变", { exact: true }),
  ).toBeVisible();
  await expect(cost).toHaveValue("75");
  await expect(page.locator("form[data-unsaved]")).toHaveCount(0);
  await page.getByRole("tab", { name: "下级服务商", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "直接下级服务商", exact: true }),
  ).toBeVisible();
});
