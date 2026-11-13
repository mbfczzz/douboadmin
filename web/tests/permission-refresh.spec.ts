import { test, expect } from "@playwright/test";
import { mockLogin } from "./mock-login";
import { openModels, modelPage } from "./model-tab-fixture";

test("permission changes discard old hierarchy data and reject late identity responses", async ({
  page,
}) => {
  await mockLogin(page);
  const root = {
    id: "browser-admin",
    name: "管理员",
    role: "super_admin",
    scope: "platform",
    menus: ["overview", "partners", "settings"],
    canManageAccounts: true,
    canApproveRegistrations: true,
  };
  const limited = {
    ...root,
    role: "operator",
    menus: ["partners"],
    canManageAccounts: false,
    canApproveRegistrations: false,
  };
  let restricted = false;
  await page.route("**/api/admin/partners/tree?*", (r) =>
    r.fulfill({
      json: {
        items: restricted
          ? []
          : [
              {
                id: "private-node",
                version: 1,
                children: 0,
                data: {
                  name: "原超管可见的其他分支",
                  role: "branch",
                  status: "active",
                },
              },
            ],
        total: restricted ? 0 : 1,
        page: 1,
      },
    }),
  );
  await page.goto("/#partners");
  await expect(
    page.getByText("原超管可见的其他分支", { exact: true }),
  ).toBeVisible();
  let arrived = false,
    release!: () => void,
    calls = 0;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/admin/me", async (r) => {
    calls++;
    if (calls === 1) {
      arrived = true;
      await pending;
      await r.fulfill({ json: root }).catch(() => {});
    } else await r.fulfill({ json: limited });
  });
  await page.evaluate(() =>
    window.dispatchEvent(new Event("permissions-changed")),
  );
  await expect.poll(() => arrived).toBe(true);
  restricted = true;
  await page.evaluate(() =>
    window.dispatchEvent(new Event("permissions-changed")),
  );
  await expect(
    page.getByRole("button", { name: "系统设置", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("原超管可见的其他分支", { exact: true }),
  ).toHaveCount(0);
  release();
  await expect(
    page.getByText(
      "当前账号未关联服务商，暂无可查看的下级。请联系超级管理员。",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "系统设置", exact: true }),
  ).toHaveCount(0);
});

test("confirmed account revocation clears the workspace", async ({ page }) => {
  await mockLogin(page);
  await page.route("**/api/admin/me", (r) =>
    r.fulfill({ status: 403, json: { error: "账号已停用" } }),
  );
  await page.evaluate(() =>
    window.dispatchEvent(new Event("permissions-changed")),
  );
  await expect(page.getByRole("button", { name: "登录管理台" })).toBeVisible();
  await expect(page.locator(".sidebar")).toHaveCount(0);
});

test("a transient read error keeps data but a permission denial clears it", async ({
  page,
}) => {
  let status = 200;
  await openModels(page, (route) =>
    route.fulfill(
      status === 200
        ? {
            json: modelPage("image", { name: "权限撤回后必须消失" }),
          }
        : {
            status,
            json: { error: status === 503 ? "暂时连接失败" : "查看权限已撤回" },
          },
    ),
  );
  const privateRow = page.getByText("权限撤回后必须消失", { exact: true });
  await expect(privateRow).toBeVisible();
  status = 503;
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(page.getByText("暂时连接失败", { exact: true })).toBeVisible();
  await expect(privateRow).toBeVisible();
  status = 403;
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(page.getByText("查看权限已撤回", { exact: true })).toBeVisible();
  await expect(privateRow).toHaveCount(0);
});
