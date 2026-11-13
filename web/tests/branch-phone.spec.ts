import { expect, test } from "@playwright/test";
import { mockLogin } from "./mock-login";

test("new branch requires phone and sends it with credentials", async ({
  page,
}) => {
  await mockLogin(page);
  await page.route("**/api/admin/partners/tree?*", (r) =>
    r.fulfill({ json: { items: [], page: 1, total: 0 } }),
  );
  await page.route("**/api/admin/roles", (r) =>
    r.fulfill({
      json: [
        {
          id: "branch",
          data: { name: "分公司", scope: "partner", menus: ["partners"] },
        },
      ],
    }),
  );
  let writes = 0;
  await page.route("**/api/admin/partners", (r) => {
    writes++;
    const body = r.request().postDataJSON();
    expect(body.phone).toBe("13900139000");
    expect(body.account.username).toBeTruthy();
    expect(body.role).toBe("branch");
    return r.fulfill({
      status: 409,
      json: { error: "该手机号已绑定其他分公司" },
    });
  });
  await page.getByRole("button", { name: "服务商管理", exact: true }).click();
  await page.getByRole("button", { name: "新增分公司", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "新增分公司", exact: true });
  await dialog.getByLabel("服务商名称").fill("手机归属测试");
  const phone = dialog.getByLabel("负责人手机号", { exact: true });
  await expect(phone).toHaveAttribute("required", "");
  await dialog.getByRole("button", { name: "保存服务商" }).click();
  expect(writes).toBe(0);
  await phone.fill("13900139000");
  await dialog.getByRole("button", { name: "保存服务商" }).click();
  await expect(
    page.getByText("该手机号已绑定其他分公司", { exact: true }),
  ).toBeVisible();
  await expect(phone).toHaveValue("13900139000");
  await expect(dialog).toBeVisible();
  expect(writes).toBe(1);
});
