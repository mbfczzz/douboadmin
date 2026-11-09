import { test, expect, type Locator, type Page } from "@playwright/test";
import { confirmSubmission, login, catalog } from "./helpers";
import type { Model, Row } from "../src/api";

// Prefer the production models these checks were written for, but fall back
// to any equivalent model so the suite also runs against a test relay.
async function pickModel(
  page: Page,
  preferred: string,
  fits: (m: Model) => boolean,
): Promise<Row<Model>> {
  const rows = await catalog(page),
    row =
      rows.find((r) => r.data.key === preferred) ||
      rows.find((r) => r.data.published && fits(r.data));
  expect(row, `需要一个可配置的模型（${preferred} 或同类）`).toBeTruthy();
  return row!;
}
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Each settings part has its own row button and dialog.
async function openModel(page: Page, key: string, part = "基础信息") {
  await page.getByRole("button", { name: "模型管理", exact: true }).click();
  await page.getByLabel("搜索模型").fill(key);
  const row = page.locator("tbody tr").filter({
    has: page.locator("small", {
      hasText: new RegExp("^" + escape(key) + "$"),
    }),
  });
  await row.getByRole("button", { name: part, exact: true }).click();
  return page.getByRole("dialog");
}

test("FlowingLight configuration layout, independent scroll and narrow screens", async ({
  page,
}) => {
  await login(page);
  const model = await pickModel(
    page,
    "nano-banana-2-4k",
    (m) => m.kind === "image",
  );
  const dialog = await openModel(page, model.data.key);
  await expect(dialog).toHaveAttribute(
    "aria-label",
    new RegExp("^基础信息 · " + escape(model.data.name)),
  );
  // The dialog title names the part; no repeated section heading inside.
  await expect(
    dialog.getByRole("heading", { name: /^基础信息 ·/ }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "基础信息", exact: true }),
  ).toHaveCount(0);
  // Only this part's fields are in the dialog.
  await expect(dialog.getByLabel("运行状态", { exact: true })).toHaveCount(0);
  await expect(dialog.locator("pre")).toHaveCount(0);
  const box = await dialog.boundingBox();
  expect(box?.width).toBe(1040);
  await expect(
    dialog.getByRole("button", { name: "保存", exact: true }),
  ).toBeVisible();
  expect(
    await page
      .locator(".model-config-mask")
      .evaluate((e) => getComputedStyle(e).backdropFilter),
  ).toBe("none");
  await page.screenshot({ path: "../.runtime/flowlight-model-config-top.png" });
  await dialog
    .locator(".model-config-body")
    .evaluate((e) => (e.scrollTop = e.scrollHeight));
  await expect(
    dialog.getByRole("heading", { name: /^基础信息 ·/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "../.runtime/flowlight-model-config-bottom.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBeTruthy();
  const small = await dialog.boundingBox();
  expect(small!.x).toBeGreaterThanOrEqual(0);
  expect(small!.x + small!.width).toBeLessThanOrEqual(390);
  await expect(
    dialog.getByRole("button", { name: "保存", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../.runtime/flowlight-model-config-mobile.png",
  });
});

test("capability chips, prompts, pricing and metadata persist and survive upstream sync", async ({
  page,
}) => {
  await login(page);
  const original = await pickModel(
    page,
    "gpt-image-2",
    (m) =>
      m.kind === "image" &&
      m.qualities.includes("high") &&
      m.resolutions.includes("1k"),
  );
  const m = original.data;
  try {
    const save = async (dialog: Locator) => {
      await dialog.getByRole("button", { name: "保存", exact: true }).click();
      await confirmSubmission(page);
      await expect(dialog).toHaveCount(0);
    };
    let dialog = await openModel(page, m.key, "基础信息");
    await dialog.getByLabel("描述", { exact: true }).fill("配置回归测试");
    await dialog.getByLabel("成本价（USD）", { exact: true }).fill("0.023456");
    await save(dialog);
    dialog = await openModel(page, m.key, "生成能力");
    await dialog.getByLabel("最大参考图数量", { exact: true }).fill("2");
    const group = dialog.getByRole("group", { name: "支持画质", exact: true });
    for (const label of ["低画质", "标准画质"]) {
      const button = group.getByRole("button", { name: label, exact: true });
      if ((await button.getAttribute("aria-pressed")) === "true")
        await button.click();
    }
    await save(dialog);
    dialog = await openModel(page, m.key, "提示词");
    await dialog
      .getByRole("textbox", { name: "默认提示词", exact: true })
      .fill("窗边静物，自然光与细腻质感。");
    await dialog
      .getByRole("button", { name: "添加灵感词", exact: true })
      .click();
    await dialog
      .getByLabel("灵感提示词 1", { exact: true })
      .fill("电影感的城市雨夜");
    await save(dialog);
    dialog = await openModel(page, m.key, "定价");
    await dialog.getByLabel("高画质 1K 积分", { exact: true }).fill("7.5");
    await save(dialog);
    dialog = await openModel(page, m.key, "状态");
    await expect(dialog.getByLabel("运行状态", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "添加映射", exact: true }).click();
    await dialog.getByLabel("错误匹配片段 1", { exact: true }).fill("balance");
    await dialog
      .getByLabel("用户提示文案 1", { exact: true })
      .fill("服务额度暂时不足，请稍后再试");
    await save(dialog);
    const sync = await page.request.post("/api/admin/models/sync");
    expect(sync.ok()).toBeTruthy();
    const current = (await catalog(page)).find((r) => r.id === original.id)!;
    expect(current.data.settings?.priceMatrix?.high?.["1k"]).toBe(7.5);
    expect(current.data.settings?.defaultPrompt).toBe(
      "窗边静物，自然光与细腻质感。",
    );
    const config = await (await page.request.get("/api/config")).json();
    const exposed: Model = config.models.find(
      (r: Model) => r.id === original.id,
    );
    expect(exposed.qualities).toEqual(["high"]);
    expect(exposed.settings?.costUsd).toBeUndefined();
    expect(exposed.settings?.errorHints).toBeUndefined();
    await page.getByRole("button", { name: "刷新", exact: true }).click();
    const prompts = await openModel(page, m.key, "提示词");
    await expect(
      prompts.getByRole("textbox", { name: "默认提示词", exact: true }),
    ).toHaveValue("窗边静物，自然光与细腻质感。");
    await prompts.getByRole("button", { name: "取消", exact: true }).click();
    const prices = await openModel(page, m.key, "定价");
    await expect(
      prices.getByLabel("高画质 1K 积分", { exact: true }),
    ).toHaveValue("7.5");
  } finally {
    const latest = (await catalog(page)).find((r) => r.id === original.id)!;
    const restored = await page.request.put(
      "/api/admin/models/" + original.id,
      { data: { version: latest.version, data: m } },
    );
    expect(restored.ok()).toBeTruthy();
  }
});
