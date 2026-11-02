import { test, expect, type Page } from "@playwright/test";
import { login, catalog } from "./helpers";
import type { Model } from "../src/api";

async function openModel(page: Page, key: string) {
  await page.getByRole("button", { name: "模型管理", exact: true }).click();
  await page.getByLabel("搜索模型").fill(key);
  const row = page.locator("tbody tr").filter({
    has: page.locator("small", {
      hasText: new RegExp(
        "^" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$",
      ),
    }),
  });
  await row.getByRole("button", { name: "配置", exact: true }).click();
  return page.getByRole("dialog");
}

test("FlowingLight configuration layout, independent scroll and narrow screens", async ({
  page,
}) => {
  await login(page);
  const dialog = await openModel(page, "nano-banana-2-4k");
  await expect(dialog).toHaveAttribute(
    "aria-label",
    /配置模型 · Nano Banana 2/,
  );
  await expect(
    dialog.getByRole("heading", { name: "基础信息", exact: true }),
  ).toBeVisible();
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
  await expect(dialog.getByLabel("运行状态", { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: /配置模型 ·/ }),
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
  const original = (await catalog(page)).find(
    (r) => r.data.key === "gpt-image-2",
  )!;
  const m = original.data;
  try {
    const dialog = await openModel(page, m.key);
    await dialog.getByLabel("描述", { exact: true }).fill("配置回归测试");
    await dialog.getByLabel("成本价（USD）", { exact: true }).fill("0.023456");
    await dialog.getByLabel("最大参考图数量", { exact: true }).fill("2");
    const group = dialog.getByRole("group", { name: "支持画质", exact: true });
    for (const label of ["低画质", "标准画质"]) {
      const button = group.getByRole("button", { name: label, exact: true });
      if ((await button.getAttribute("aria-pressed")) === "true")
        await button.click();
    }
    await dialog
      .getByRole("textbox", { name: "默认提示词", exact: true })
      .fill("窗边静物，自然光与细腻质感。");
    await dialog
      .getByRole("button", { name: "添加灵感词", exact: true })
      .click();
    await dialog
      .getByLabel("灵感提示词 1", { exact: true })
      .fill("电影感的城市雨夜");
    await dialog.getByLabel("高画质 1K 积分", { exact: true }).fill("7.5");
    await dialog.getByRole("button", { name: "添加映射", exact: true }).click();
    await dialog.getByLabel("错误匹配片段 1", { exact: true }).fill("balance");
    await dialog
      .getByLabel("用户提示文案 1", { exact: true })
      .fill("服务额度暂时不足，请稍后再试");
    await dialog.getByRole("button", { name: "保存", exact: true }).click();
    await expect(dialog).toHaveCount(0);
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
    const reopened = await openModel(page, m.key);
    await expect(
      reopened.getByRole("textbox", { name: "默认提示词", exact: true }),
    ).toHaveValue("窗边静物，自然光与细腻质感。");
    await expect(
      reopened.getByLabel("高画质 1K 积分", { exact: true }),
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
