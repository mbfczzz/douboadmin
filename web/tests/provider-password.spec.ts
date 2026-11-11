import { expect, test, type Page } from "@playwright/test";
import { mockLogin } from "./mock-login";

async function openAccount(page: Page, password?: string, exists = true) {
  await mockLogin(page);
  const partner = {
    id: "password-provider",
    version: 1,
    children: 0,
    createdAt: "2026-11-10T00:00:00Z",
    data: {
      name: "测试分公司",
      role: "branch",
      parentId: "root",
      path: [],
      status: "active",
      retailPer100Fen: 10000,
      childMarginBps: 5000,
    },
  };
  let account = exists
    ? {
        id: "provider-login",
        version: 1,
        createdAt: "2026-11-10T00:00:00Z",
        data: {
          username: "provider-test",
          name: "测试分公司",
          role: "partner",
          disabled: false,
        },
      }
    : null;
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/admin/roles", (route) =>
    route.fulfill({
      json: [
        {
          id: "partner",
          version: 1,
          data: { name: "服务商", scope: "partner", menus: ["partners"] },
        },
      ],
    }),
  );
  await page.route("**/api/admin/partners/tree?*", (route) =>
    route.fulfill({ json: { items: [partner], page: 1, size: 20, total: 1 } }),
  );
  await page.route(
    "**/api/admin/partners/password-provider/account",
    (route) => {
      if (route.request().method() === "PUT") {
        const body = route.request().postDataJSON();
        writes.push(body);
        if (body.password) password = body.password;
        account = {
          id: "provider-login",
          version: (account?.version || 0) + 1,
          createdAt: "2026-11-10T00:00:00Z",
          data: {
            username: body.username || account?.data.username,
            name: "测试分公司",
            role: body.role,
            disabled: body.disabled,
          },
        };
        return route.fulfill({ json: { account } });
      }
      return route.fulfill({ json: { account, password } });
    },
  );
  await page.goto("/#partners");
  const button = page.getByRole("button", { name: "登录账号", exact: true });
  await button.click();
  const dialog = page.getByRole("dialog", { name: "登录账号", exact: true });
  await expect(dialog).toBeVisible();
  return { dialog, button, writes };
}

for (const width of [1440, 390, 320]) {
  test(`provider account displays its password without overflow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const password = "Abc2".repeat(32);
    const { dialog, button } = await openAccount(page, password);
    await expect(dialog.locator(".account-password")).toHaveText(password);
    await expect(dialog.locator(".account-password")).toHaveCSS(
      "white-space",
      "normal",
    );
    expect(
      await dialog
        .locator(".account-password")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await expect(dialog.locator(".account-facts dt")).toHaveText([
      "账号",
      "密码",
      "角色",
      "状态",
      "最后登录",
    ]);
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    const stored = await page.evaluate(() =>
      JSON.stringify([
        Object.values(localStorage),
        Object.values(sessionStorage),
      ]),
    );
    expect(stored).not.toContain(password);
    await page.screenshot({
      path: `../.runtime/provider-password-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await dialog.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(page.getByText(password, { exact: true })).toHaveCount(0);
    await button.click();
    await expect(dialog.locator(".account-password")).toHaveText(password);
  });
}

test("legacy account explains missing password and shows a successfully reset password after reopening", async ({
  page,
}) => {
  const { dialog, button, writes } = await openAccount(page);
  await expect(dialog.locator(".account-password")).toContainText(
    "请重置后查看",
  );
  await dialog.getByRole("button", { name: "重置密码", exact: true }).click();
  const reset = page.getByRole("dialog", { name: "重置密码", exact: true });
  await reset
    .getByLabel("新密码", { exact: true })
    .fill("provider-new-password-2026");
  await reset.getByRole("button", { name: "保存新密码", exact: true }).click();
  await expect(reset).toHaveCount(0);
  await expect(dialog.locator(".account-password")).toHaveText(
    "provider-new-password-2026",
  );
  expect(writes).toEqual([
    {
      accountId: "provider-login",
      version: 1,
      role: "partner",
      disabled: false,
      password: "provider-new-password-2026",
    },
  ]);
  await expect(page.locator(".save-confirmation")).toHaveCount(0);
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await button.click();
  await expect(dialog.locator(".account-password")).toHaveText(
    "provider-new-password-2026",
  );
});

test("new provider account shows the submitted password after creation", async ({
  page,
}) => {
  const { dialog, writes } = await openAccount(page, undefined, false);
  await dialog.getByLabel("账号", { exact: true }).fill("provider-new");
  await dialog
    .getByLabel("初始密码", { exact: true })
    .fill("provider-initial-password-2026");
  await dialog.getByRole("button", { name: "开通账号", exact: true }).click();
  await expect(dialog.locator(".account-password")).toHaveText(
    "provider-initial-password-2026",
  );
  await expect(dialog.locator(".account-facts")).toContainText("provider-new");
  expect(writes).toHaveLength(1);
});
