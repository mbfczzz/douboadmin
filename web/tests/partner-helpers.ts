import { expect, type Page } from "@playwright/test";

export async function createProvider(page: Page, name: string) {
  await page.getByRole("tab").first().click();
  await page.getByRole("button", { name: /新增(下级)?服务商/ }).click();
  const dialog = page.getByRole("dialog", {
    name: /新增(下级)?服务商/,
  });
  await dialog.getByLabel("服务商名称").fill(name);
  await dialog.getByLabel("可授权账号额度").fill("10");
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/admin/partners" &&
      r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "保存服务商", exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(200);
  await expect(dialog).toHaveCount(0);
  return result.json();
}
export async function selectProvider(page: Page, name: string) {
  if (name === "总账号") {
    const back = page.getByRole("button", { name: "返回上一级", exact: true });
    const scope = page.locator(".partner-scope-bar");
    for (let i = 0; i < 8 && (await back.count()); i++) {
      const previous = await scope.innerText();
      await back.click();
      await expect
        .poll(
          async () =>
            (await scope.count()) === 0 ||
            (await scope.innerText()) !== previous,
        )
        .toBeTruthy();
    }
    await expect(
      page.getByRole("tab", { name: "服务商列表", exact: true }),
    ).toBeVisible();
    return;
  }
  await page.getByRole("tab").first().click();
  await page
    .locator("tbody tr, article.mobile-record")
    .filter({ hasText: name })
    .getByRole("button", { name: "管理", exact: true })
    .click();
  await expect(page.locator(".partner-scope-bar")).toContainText(name);
}
export async function allocate(page: Page, name: string, users: number) {
  await page.getByRole("tab", { name: "名额划拨", exact: true }).click();
  await page
    .getByRole("button", { name: "划拨 / 收回名额", exact: true })
    .click();
  const form = page.getByRole("dialog", {
    name: "名额划拨 / 收回",
    exact: true,
  });
  await form
    .getByRole("button", { name: "选择直接下级服务商", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "选择直接下级服务商",
    exact: true,
  });
  await picker.getByLabel("查询记录").focus();
  await page.keyboard.press("Tab");
  await expect(
    picker.getByRole("button", { name: "查询", exact: true }),
  ).toBeFocused();
  await picker
    .locator("tbody tr")
    .filter({ hasText: name })
    .getByRole("button", { name: "选择", exact: true })
    .click();
  await form.getByLabel("用户额度", { exact: true }).fill(String(users));
  await form.getByLabel("原因", { exact: true }).fill("隔离验收名额划拨");
  await form.getByRole("button", { name: `确认划拨 ${users} 个名额` }).click();
  await expect(form).toHaveCount(0);
}
export async function issueCode(page: Page, label = "隔离验收授权码") {
  await page.getByRole("tab", { name: "授权激活", exact: true }).click();
  await page.getByRole("button", { name: "生成授权码", exact: true }).click();
  const form = page.getByRole("dialog", { name: "生成授权码", exact: true });
  await form.getByLabel("备注", { exact: true }).fill(label);
  await form
    .getByRole("button", { name: "生成并预留名额", exact: true })
    .click();
  const qr = page.getByRole("dialog", {
    name: "授权二维码 / 激活码",
    exact: true,
  });
  await expect(qr.getByAltText("豆播授权二维码")).toBeVisible();
  expect(
    await qr
      .getByAltText("豆播授权二维码")
      .evaluate((el: HTMLImageElement) => el.naturalWidth),
  ).toBe(320);
  const code = (await qr.locator("strong").innerText()).replaceAll("-", "");
  expect(code).toMatch(/^[A-Z2-7]{20}$/);
  await page.screenshot({
    path: "../.runtime/partners-qr-isolated-test.png",
    fullPage: true,
  });
  await qr.getByRole("button", { name: "关闭", exact: true }).click();
  return code;
}
