import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers";

test.skip(
  process.env.DOUBO_TEST_ISOLATED_SETTINGS !== "true",
  "Requires an isolated API; never overwrite business credentials in normal E2E runs.",
);
test.beforeEach(async ({ request }) => {
  const config = await (await request.get("/api/config")).json();
  expect(
    config.storage,
    "settings tests must only use disposable memory storage",
  ).toBe("memory");
});

async function settings(page: Page) {
  await login(page);
  await page.getByRole("button", { name: "系统设置", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "服务接入配置" }),
  ).toBeVisible();
  await expect(page.locator("details.integration")).toHaveCount(8);
}
async function group(page: Page, name: string) {
  const card = page.locator("details.integration").filter({
    has: page.locator("summary b", { hasText: name }),
  });
  await card.locator("summary").click();
  return card;
}

test("real API stores a masked secret and independent forms preserve drafts", async ({
  page,
}) => {
  await settings(page);
  const oss = await group(page, "阿里云 OSS");
  await oss
    .getByLabel("存储桶 Bucket", { exact: true })
    .fill("unsaved-fixture");
  const relay = await group(page, "AI 中转站");
  await relay
    .getByLabel("API 基础地址", { exact: false })
    .fill("http://127.0.0.1:9");
  await relay
    .getByLabel("API Key", { exact: true })
    .fill("fixture-private-relay-key");
  await relay.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  await expect(relay.locator("summary")).toContainText("待重启");
  await expect(relay.getByLabel("API Key", { exact: true })).toHaveValue("");
  await expect(relay.getByLabel("API Key", { exact: true })).toHaveAttribute(
    "placeholder",
    "已配置，留空保持",
  );
  await expect(oss.getByLabel("存储桶 Bucket", { exact: true })).toHaveValue(
    "unsaved-fixture",
  );
  const response = await page.request.get("/api/admin/integrations");
  expect(response.status()).toBe(200);
  expect(await response.text()).not.toContain("fixture-private-relay-key");
  await oss.getByRole("button", { name: "重新读取", exact: true }).click();
  await expect(oss.getByLabel("存储桶 Bucket", { exact: true })).toHaveValue(
    "",
  );
});

test("structured products preserve typing, convert units, and populate custom amount choices", async ({
  page,
}) => {
  await settings(page);
  const card = await group(page, "微信虚拟支付");
  await card.getByRole("button", { name: "添加积分套餐", exact: true }).click();
  await card.getByLabel("商品 ID", { exact: true }).fill("fixture-10001");
  await card.getByLabel("套餐名称", { exact: true }).fill("测试积分");
  const price = card.getByLabel("售价（元）", { exact: true });
  await price.pressSequentially("0.1");
  await expect(price).toHaveValue("0.1");
  await expect(price).toBeFocused();
  await card.getByLabel("到账积分", { exact: true }).fill("10");
  await card
    .getByLabel("自定义金额基础商品", { exact: false })
    .selectOption("fixture-10001");
  await card.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  const data = await (await page.request.get("/api/admin/integrations")).json();
  const values = data.groups.find(
    (g: { id: string }) => g.id === "virtual",
  ).values;
  expect(JSON.parse(values.WECHAT_VIRTUAL_PRODUCTS)).toEqual([
    { id: "fixture-10001", name: "测试积分", amountFen: 10, pointsUnits: 1000 },
  ]);
  expect(values.WECHAT_VIRTUAL_CUSTOM_PRODUCT_ID).toBe("fixture-10001");
});

test("a stale save retains the draft and rereading discards it explicitly", async ({
  page,
}) => {
  await settings(page);
  const card = await group(page, "热门视频接口");
  const field = card.getByLabel("TikHub API 地址", { exact: true });
  await field.fill("https://draft.example");
  const data = await (await page.request.get("/api/admin/integrations")).json();
  const current = data.groups.find((g: { id: string }) => g.id === "hot");
  const saved = await page.request.put("/api/admin/integrations/hot", {
    data: {
      version: current.version,
      values: { TIKHUB_BASE_URL: "https://newer.example" },
    },
  });
  expect(saved.status()).toBe(200);
  await card.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(card.getByRole("alert")).toContainText("其他管理员");
  await expect(field).toHaveValue("https://draft.example");
  await card.getByRole("button", { name: "重新读取", exact: true }).click();
  await expect(field).toHaveValue("https://newer.example");
});

test("explicit secret removal is distinct from leaving the password input blank", async ({
  page,
}) => {
  await settings(page);
  const card = await group(page, "微信登录");
  await card
    .getByLabel("小程序 AppID", { exact: true })
    .fill("wx0000000000000001");
  await card
    .getByLabel("小程序密钥 AppSecret", { exact: true })
    .fill("wechat-secret-fixture");
  await card.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  const clear = card.getByLabel("清除小程序密钥 AppSecret", { exact: true });
  await expect(clear).toBeVisible();
  await clear.check();
  await expect(
    card.getByLabel("小程序密钥 AppSecret", { exact: true }),
  ).toBeDisabled();
  await card.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(clear).toHaveCount(0);
  await expect(
    card.getByLabel("小程序密钥 AppSecret", { exact: true }),
  ).toHaveAttribute("placeholder", "尚未配置");
});

test("duplicate notification fields cannot silently overwrite each other", async ({
  page,
}) => {
  await settings(page);
  const card = await group(page, "完成订阅通知");
  for (const content of ["{{title}}", "{{state}}"]) {
    await card
      .getByRole("button", { name: "添加模板字段映射", exact: true })
      .click();
    await card.getByLabel("微信字段名", { exact: true }).last().fill("thing1");
    await card.getByLabel("字段内容", { exact: true }).last().fill(content);
  }
  await card.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect
    .poll(() =>
      card
        .getByLabel("微信字段名", { exact: true })
        .last()
        .evaluate((el: HTMLInputElement) => el.validationMessage),
    )
    .toContain("重复");
  await card.getByLabel("微信字段名", { exact: true }).last().fill("thing2");
  await card.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
});

test("settings groups fit desktop and mobile widths", async ({ page }) => {
  await settings(page);
  await group(page, "微信登录");
  await page.screenshot({
    path: "../.runtime/settings-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const card = await group(page, "微信虚拟支付");
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByRole("combobox", { name: /^支付通道/ })).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await card.getByRole("button", { name: "添加积分套餐", exact: true }).click();
  const input = await card
    .getByLabel("商品 ID", { exact: true })
    .last()
    .boundingBox();
  expect(input!.x).toBeGreaterThanOrEqual(0);
  expect(input!.x + input!.width).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "../.runtime/settings-mobile.png",
    fullPage: true,
  });
});

test("reread removes duplicate drafts even when serialized JSON is unchanged", async ({
  page,
}) => {
  await settings(page);
  const response = await (
    await page.request.get("/api/admin/integrations")
  ).json();
  const current = response.groups.find(
    (g: { id: string }) => g.id === "notifications",
  );
  const result = await page.request.put(
    "/api/admin/integrations/notifications",
    {
      data: {
        version: current.version,
        values: { WECHAT_COMPLETION_FIELDS: '{"thing7":"{{time}}"}' },
      },
    },
  );
  expect(result.status()).toBe(200);
  const card = await group(page, "完成订阅通知");
  await card.getByRole("button", { name: "重新读取", exact: true }).click();
  await expect(card.getByLabel("微信字段名", { exact: true })).toHaveCount(1);
  await card
    .getByRole("button", { name: "添加模板字段映射", exact: true })
    .click();
  await card.getByLabel("微信字段名", { exact: true }).last().fill("thing7");
  await card.getByLabel("字段内容", { exact: true }).last().fill("{{time}}");
  await expect(card.getByLabel("微信字段名", { exact: true })).toHaveCount(2);
  await card.getByRole("button", { name: "重新读取", exact: true }).click();
  await expect(card.getByLabel("微信字段名", { exact: true })).toHaveCount(1);
  await expect(card.locator("form")).not.toHaveAttribute("data-unsaved");
});

test("removing the custom amount base product clears its selection and permits saving", async ({
  page,
}) => {
  await settings(page);
  const card = await group(page, "微信虚拟支付");
  const products = card.getByRole("region", { name: "积分套餐配置" });
  while (
    await products
      .getByRole("button", { name: "移除此项", exact: true })
      .count()
  ) {
    await products
      .getByRole("button", { name: "移除此项", exact: true })
      .first()
      .click();
  }
  await expect(
    card.getByLabel("自定义金额基础商品", { exact: true }),
  ).toHaveValue("");
  await card.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  const data = await (await page.request.get("/api/admin/integrations")).json();
  const values = data.groups.find(
    (g: { id: string }) => g.id === "virtual",
  ).values;
  expect(values.WECHAT_VIRTUAL_CUSTOM_PRODUCT_ID).toBe("");
  expect(JSON.parse(values.WECHAT_VIRTUAL_PRODUCTS)).toEqual([]);
});
