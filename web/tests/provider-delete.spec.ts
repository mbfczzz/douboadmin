import { test, expect } from "@playwright/test";
import { mockLogin } from "./mock-login";

test("super admin previews cascade, confirms name, and reconfirms after tree changes", async ({
  page,
}) => {
  await mockLogin(page);
  let deleted = false,
    writes = 0,
    token = "snapshot-one";
  const row = {
    id: "delete-branch",
    version: 1,
    children: 0,
    data: {
      name: "删除测试分公司",
      role: "branch",
      status: "active",
      parentId: "root",
    },
  };
  await page.route("**/api/admin/partners/tree?*", (r) =>
    r.fulfill({
      json: { items: deleted ? [] : [row], page: 1, total: deleted ? 0 : 1 },
    }),
  );
  await page.route("**/api/admin/partners/delete-branch/delete-preview", (r) =>
    r.fulfill({
      json: {
        name: row.data.name,
        providers: token === "snapshot-one" ? 3 : 4,
        accounts: 2,
        members: 5,
        users: 6,
        token,
      },
    }),
  );
  await page.route("**/api/admin/partners/delete-branch", (r) => {
    expect(r.request().method()).toBe("DELETE");
    expect(r.request().postDataJSON().confirm).toBe("delete-users");
    writes++;
    expect(r.request().postDataJSON().token).toBe(token);
    if (writes === 1) {
      token = "snapshot-two";
      return r.fulfill({
        status: 409,
        json: { error: "数据已发生变化，请刷新后重试" },
      });
    }
    deleted = true;
    return r.fulfill({ json: { providers: 4 } });
  });
  await page.getByRole("button", { name: "服务商管理", exact: true }).click();
  await page.getByRole("button", { name: "删除", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "删除服务商及下级" });
  await expect(dialog).toContainText("共 3 个服务商节点");
  const submit = dialog.getByRole("button", { name: "确认删除结构和用户" });
  await expect(submit).toBeDisabled();
  await expect(dialog).toContainText("同时删除 6 个用户账号");
  await dialog.getByLabel("删除原因").fill("测试撤销组织结构");
  await dialog.getByLabel("输入服务商全名确认").fill(row.data.name);
  await dialog.getByLabel("我确认同时删除上述用户账号").check();
  await submit.click();
  await expect(dialog).toContainText("共 4 个服务商节点");
  await expect(submit).toBeDisabled();
  await dialog.getByLabel("输入服务商全名确认").fill(row.data.name);
  await dialog.getByLabel("我确认同时删除上述用户账号").check();
  await submit.click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "删除", exact: true }),
  ).toHaveCount(0);
  expect(writes).toBe(2);
});
