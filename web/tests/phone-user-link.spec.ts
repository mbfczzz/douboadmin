import { expect, test } from "@playwright/test";
import { mockLogin } from "./mock-login";

test("super admin can resolve a phone conflict and link an existing backend account", async ({
  page,
}) => {
  await mockLogin(page);
  const account = {
    id: "credential",
    version: 3,
    data: {
      username: "operator",
      name: "测试运营",
      role: "operator",
      phone: "",
      userId: "",
    },
  };
  await page.route("**/api/admin/roles", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/admin/accounts?*", (r) =>
    r.fulfill({
      json: { items: [account], page: 1, total: 1, canManage: true },
    }),
  );
  let attempts = 0;
  await page.route("**/api/admin/accounts/credential/user", (r) => {
    const body = r.request().postDataJSON();
    expect(body.version).toBe(3);
    attempts++;
    if (attempts === 1)
      return r.fulfill({
        status: 409,
        json: { error: "该手机号已关联其他后台账号" },
      });
    expect(body.phone).toBe("13900139001");
    account.version++;
    account.data.phone = body.phone;
    account.data.userId = "unified-user";
    return r.fulfill({ json: account });
  });
  await page.getByRole("button", { name: "管理账号", exact: true }).click();
  await page.getByRole("button", { name: "关联用户", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "关联用户账号" });
  await dialog.getByLabel("用户手机号").fill("13900139000");
  await dialog.getByRole("button", { name: "确认关联" }).click();
  await expect(dialog.getByRole("alert")).toContainText("已关联其他后台账号");
  await dialog.getByLabel("用户手机号").fill("13900139001");
  await dialog.getByRole("button", { name: "确认关联" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("tbody")).toContainText("已关联用户");
  await expect(
    page.getByRole("button", { name: "关联用户", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByLabel("手机号", { exact: true }),
  ).toHaveAttribute("readonly", "");
});

test("user list shows registration source without inventing extra users", async ({
  page,
}) => {
  await mockLogin(page);
  await page.route("**/api/admin/users?*", (r) =>
    r.fulfill({
      json: {
        page: 1,
        total: 2,
        items: [
          {
            id: "one",
            version: 1,
            data: {
              nickname: "多端用户",
              phone: "13900139000",
              source: "miniprogram",
              sources: ["miniprogram", "app"],
            },
          },
          {
            id: "two",
            version: 1,
            data: { nickname: "应用用户", phone: "13900139001", source: "app" },
          },
        ],
      },
    }),
  );
  await page.getByRole("button", { name: "用户管理", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(
    page.locator("tbody tr").filter({ hasText: "多端用户" }),
  ).toContainText("小程序");
  await expect(
    page.locator("tbody tr").filter({ hasText: "应用用户" }),
  ).toContainText("App");
});
