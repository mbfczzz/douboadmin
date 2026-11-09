import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers";
import { surfaceFixtures } from "./surface-fixtures";

async function integration(page: Page) {
  await login(page);
  await page.getByRole("button", { name: "系统设置", exact: true }).click();
  const card = page
    .locator("details.integration")
    .filter({ has: page.locator("summary b", { hasText: "AI 中转站" }) });
  await card.locator("summary").click();
  await card
    .getByLabel("API 基础地址", { exact: false })
    .fill("https://fixture.example.test");
  await card
    .getByLabel("API Key", { exact: true })
    .fill("private-confirmation-fixture");
  return card;
}
const confirmation = (page: Page) =>
  page.getByRole("dialog", { name: "确认修改AI 中转站", exact: true });

test("configuration cancel makes no request and preserves draft; approval submits once with secrets hidden", async ({
  page,
}) => {
  const card = await integration(page);
  let writes = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route("**/api/admin/integrations/relay", async (route) => {
    writes++;
    expect(route.request().postDataJSON().values.RELAY_API_KEY).toBe(
      "private-confirmation-fixture",
    );
    await pending;
    await route.fulfill({
      status: 503,
      json: { error: "测试提交失败，保留草稿" },
    });
  });
  await card.getByRole("button", { name: "保存配置", exact: true }).click();
  const dialog = confirmation(page);
  await expect(dialog).toContainText("https://fixture.example.test");
  await expect(dialog).toContainText("内容隐藏");
  await expect(dialog).not.toContainText("private-confirmation-fixture");
  expect(writes).toBe(0);
  await dialog.getByRole("button", { name: "返回修改" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(card.getByLabel("API Key", { exact: true })).toHaveValue(
    "private-confirmation-fixture",
  );
  expect(writes).toBe(0);
  await card.getByRole("button", { name: "保存配置", exact: true }).click();
  await dialog
    .getByRole("button", { name: "确认提交" })
    .dblclick({ force: true });
  await expect.poll(() => writes).toBe(1);
  release();
  await expect(card.getByRole("alert")).toContainText("保留草稿");
  await expect(card.getByLabel("API Key", { exact: true })).toHaveValue(
    "private-confirmation-fixture",
  );
  await card.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(writes).toBe(1);
});

for (const width of [390, 320]) {
  test(`confirmation fits ${width}px and keyboard cancellation returns focus`, async ({
    page,
  }) => {
    const card = await integration(page);
    await page.setViewportSize({ width, height: 700 });
    const save = card.getByRole("button", { name: "保存配置", exact: true });
    await save.click();
    const dialog = confirmation(page);
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    const submit = dialog.getByRole("button", { name: "确认提交" });
    await expect(submit).toBeInViewport({ ratio: 1 });
    await submit.focus();
    await page.keyboard.press("Tab");
    await expect(
      dialog.getByRole("button", { name: "关闭", exact: true }),
    ).toBeFocused();
    await page.screenshot({
      path: `../.runtime/submission-confirmation-${width}.png`,
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(save).toBeFocused();
  });
}

test("existing user profile requires approval and cancellation leaves the editor open", async ({
  page,
}) => {
  await login(page);
  await surfaceFixtures(page);
  await page.getByRole("button", { name: "小程序用户", exact: true }).click();
  await page.getByRole("button", { name: "编辑", exact: true }).first().click();
  const editor = page.getByRole("dialog", { name: "编辑用户资料" });
  await editor.getByLabel("昵称", { exact: true }).fill("保留的资料草稿");
  let writes = 0;
  await page.route("**/api/admin/users/*", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    writes++;
    await route.fulfill({ json: {} });
  });
  await editor.getByRole("button", { name: "保存用户资料" }).click();
  const dialog = page.getByRole("dialog", { name: "确认修改用户资料" });
  await expect(dialog).toContainText("保留的资料草稿");
  expect(writes).toBe(0);
  await dialog.getByRole("button", { name: "返回修改" }).click();
  await expect(editor.getByLabel("昵称", { exact: true })).toHaveValue(
    "保留的资料草稿",
  );
  await editor.getByRole("button", { name: "保存用户资料" }).click();
  await dialog.getByRole("button", { name: "确认提交" }).click();
  await expect.poll(() => writes).toBe(1);
  await expect(editor).toHaveCount(0);
});

test("session expiry dismisses pending confirmation without submitting", async ({
  page,
}) => {
  const card = await integration(page);
  let writes = 0;
  await page.route("**/api/admin/integrations/relay", async (route) => {
    writes++;
    await route.fulfill({ json: {} });
  });
  await card.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(confirmation(page)).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("session-expired")));
  await expect(page.getByLabel("账号", { exact: true })).toBeVisible();
  await expect(page.locator(".save-confirmation")).toHaveCount(0);
  expect(writes).toBe(0);
});
