import { expect, test } from "@playwright/test";
import { login } from "./helpers";
import { surfaceFixtures } from "./surface-fixtures";

const record = (
  id: string,
  name: string,
  role: string,
  parentId: string,
  status: string,
  path: string[],
) => ({
  id,
  version: 1,
  createdAt: "2026-11-02T00:00:00Z",
  data: {
    name,
    role,
    parentId,
    path,
    status,
    retailPer100Fen: 10000,
    childMarginBps: 5000,
  },
});

// Pending providers wait for the platform; nothing grows below a stopped one.
test("pending and stopped providers offer only what can work", async ({
  page,
}) => {
  await login(page);
  await surfaceFixtures(page);
  await page.route("**/api/admin/partners/tree", (route) =>
    route.fulfill({
      json: [
        record("b1", "停用分公司", "branch", "root", "disabled", ["root"]),
        record("s1a", "停用下的S1", "s1", "b1", "active", ["root", "b1"]),
        record("b2", "正常分公司", "branch", "root", "active", ["root"]),
        record("s1p", "待开通S1", "s1", "b2", "pending", ["root", "b2"]),
      ],
    }),
  );
  await page.getByRole("button", { name: "服务商管理", exact: true }).click();
  const row = (name: string) =>
    page.locator(".provider-tree-row").filter({ hasText: name }).first();
  await expect(row("待开通S1")).toContainText("等待总部开通");
  await expect(row("待开通S1").getByRole("button")).toHaveCount(0);
  await expect(
    row("正常分公司").getByRole("button", { name: "新增子级" }),
  ).toHaveCount(0);
  for (const name of ["停用分公司", "停用下的S1"])
    await expect(
      row(name).getByRole("button", { name: "新增子级" }),
    ).toHaveCount(0);
});

test("a bind still waiting for approval says so", async ({ page }) => {
  await login(page);
  await surfaceFixtures(page);
  await page.route("**/api/admin/partners/qa-provider/codes/bind", (route) =>
    route.fulfill({
      json: {
        user: {
          id: "u9",
          name: "新负责人",
          nickname: "",
          phone: "13900000009",
        },
        pending: true,
      },
    }),
  );
  await page.getByRole("button", { name: "服务商管理", exact: true }).click();
  await page
    .locator(".provider-tree-row")
    .first()
    .getByRole("button", { name: "分享码", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "分享码", exact: true });
  await dialog.locator(".owner-bind > summary").click();
  await expect(dialog.locator(".bound-owner")).toContainText(
    "已扫码登记，等待总部开通",
  );
  await dialog.getByRole("button", { name: "解除绑定" }).click();
  await expect(page.getByRole("dialog", { name: "解除绑定？" })).toContainText(
    "记为拒绝",
  );
});
