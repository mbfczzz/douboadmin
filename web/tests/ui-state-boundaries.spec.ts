import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import { surfaceFixtures } from "./surface-fixtures";

test("long model headings leave fields and save usable on a short screen", async ({
  page,
}) => {
  await login(page);
  const models = await surfaceFixtures(page);
  models[0].data.name = "长".repeat(100);
  await page.getByRole("button", { name: "模型管理", exact: true }).click();
  await page.getByRole("button", { name: "配置", exact: true }).first().click();
  await page.setViewportSize({ width: 390, height: 360 });
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("名称", { exact: true })).toBeInViewport({
    ratio: 1,
  });
  await expect(
    dialog.getByRole("button", { name: "保存", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await expect(dialog.getByLabel("名称", { exact: true })).toHaveValue(
    "长".repeat(100),
  );
});

test("repeating a provider search retries the same failed query", async ({
  page,
}) => {
  await login(page);
  await surfaceFixtures(page);
  let attempts = 0;
  await page.route("**/api/admin/partners?*", (route) => {
    const q = new URL(route.request().url()).searchParams.get("q");
    if (q === "same" && ++attempts === 1)
      return route.fulfill({ status: 503, json: { error: "测试查询失败" } });
    return route.fulfill({ json: { items: [], page: 1, size: 20, total: 0 } });
  });
  await page.getByRole("button", { name: "用户管理", exact: true }).click();
  await page.getByRole("button", { name: "服务商与授权", exact: true }).click();
  await page.getByLabel("查询记录").fill("same");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await expect.poll(() => attempts).toBe(2);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("repeating a payment search retries without changing the filters", async ({
  page,
}) => {
  await login(page);
  let attempts = 0;
  await page.route("**/api/admin/payments?*", (route) => {
    const q = new URL(route.request().url()).searchParams.get("q");
    if (q === "same" && ++attempts === 1)
      return route.fulfill({ status: 503, json: { error: "测试查询失败" } });
    return route.fulfill({ json: { items: [], page: 1, size: 20, total: 0 } });
  });
  await page.getByRole("button", { name: "支付管理", exact: true }).click();
  await page.getByLabel("搜索支付记录").fill("same");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await expect.poll(() => attempts).toBe(2);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("model import locks the submitted ID until verification finishes", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "模型管理", exact: true }).click();
  await page.getByRole("button", { name: "新增模型", exact: true }).click();
  const dialog = page.getByRole("dialog"),
    input = dialog.getByLabel("模型 ID", { exact: true });
  await input.fill("submitted-model");
  let release!: () => void,
    sent = false;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/admin/models", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    sent = true;
    await gate;
    await route.fulfill({ status: 503, json: { error: "测试核验失败" } });
  });
  await dialog.getByRole("button", { name: "添加模型", exact: true }).click();
  await expect.poll(() => sent).toBeTruthy();
  try {
    await expect(input).toBeDisabled();
  } finally {
    release();
  }
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue("submitted-model");
});

test("background notices remain above the model dialog without blocking it", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "模型管理", exact: true }).click();
  let release!: () => void,
    started = false;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/admin/models/sync", async (route) => {
    started = true;
    await pending;
    await route.fulfill({ status: 503, json: { error: "测试同步失败提示" } });
  });
  await page.getByRole("button", { name: "同步上游", exact: true }).click();
  await expect.poll(() => started).toBeTruthy();
  try {
    await page
      .getByRole("button", { name: "配置", exact: true })
      .first()
      .click();
  } finally {
    release();
  }
  const toast = page.locator(".toast");
  await expect(toast).toContainText("测试同步失败提示");
  const result = await toast.evaluate((el) => {
    const box = el.getBoundingClientRect(),
      x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    const normalHit = document.elementFromPoint(x, y);
    const original = el.style.pointerEvents;
    el.style.pointerEvents = "auto";
    const paintHit = document.elementFromPoint(x, y);
    el.style.pointerEvents = original;
    return {
      above: el === paintHit || el.contains(paintHit),
      passThrough: normalHit !== el && !el.contains(normalHit),
    };
  });
  expect(result.above).toBeTruthy();
  expect(result.passThrough).toBeTruthy();
});
