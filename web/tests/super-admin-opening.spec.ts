import { expect, test } from "@playwright/test";
import { mockLogin } from "./mock-login";
import { codes } from "./provider-code-fixture";
import { qr as qrForTest } from "./surface-fixtures";

for (const role of [
  "super_admin",
  "operator",
  "partner",
  "branch",
  "s1",
  "s2",
  "custom-admin",
  "legacy-super",
]) {
  test(`${role}: opening buttons follow the super-admin role across all entry points`, async ({
    page,
  }) => {
    await mockLogin(page);
    const provider = ["partner", "branch", "s1", "s2"].includes(role);
    const allowed = role === "super_admin";
    await page.route("**/api/admin/me", (route) =>
      route.fulfill({
        json: {
          id: "account",
          name: "超级管理员",
          role: role === "legacy-super" ? "super_admin" : role,
          roleName: "超级管理员",
          scope: provider ? "partner" : "platform",
          partnerId: provider ? "parent" : undefined,
          canApproveRegistrations: role !== "legacy-super",
          menus: ["partners", "users"],
        },
      }),
    );
    const parent = {
      id: "parent",
      version: 1,
      children: 0,
      data: {
        name: "分公司",
        role: "branch",
        parentId: "root",
        status: "active",
        ownerUser: "parent-owner",
      },
    };
    const child = {
      id: "child",
      version: 1,
      children: 0,
      data: {
        name: "待开通S1",
        role: "s1",
        parentId: "parent",
        status: "pending",
        ownerUser: "pending-user",
      },
    };
    const reg = {
      id: "pending-user",
      version: 2,
      data: {
        userId: "pending-user",
        name: "待开通用户",
        phone: "13900000000",
        role: "s1",
        status: "pending",
        partnerId: "child",
        parentId: "parent",
        code: codes.s1,
        codeKind: "s1",
        method: "scan",
        canReview: true,
        canApprove: true,
        canReject: true,
      },
    };
    await page.route("**/api/admin/partners/tree?*", (route) =>
      route.fulfill({ json: { items: [parent, child], page: 1, total: 2 } }),
    );
    await page.route("**/api/admin/partners/tree", (route) =>
      route.fulfill({ json: [parent, child] }),
    );
    await page.route("**/api/admin/partners/parent", (route) =>
      route.fulfill({
        json: { record: parent, price: { shares: [] }, commission: {} },
      }),
    );
    await page.route("**/api/admin/partners/parent/codes/*", (route) =>
      route.fulfill({ json: { code: codes.s1, qr: qrForTest } }),
    );
    await page.route("**/api/admin/partners/parent/code-uses?*", (route) =>
      route.fulfill({ json: { items: [reg], page: 1, size: 20, total: 1 } }),
    );
    await page.route(
      "**/api/admin/partners/parent/member-registrations?*",
      (route) =>
        route.fulfill({ json: { items: [reg], page: 1, size: 20, total: 1 } }),
    );
    await page.route("**/api/admin/users?*", (route) =>
      route.fulfill({ json: { items: [], page: 1, total: 0 } }),
    );
    await page.route("**/api/admin/registrations?*", (route) =>
      route.fulfill({ json: { items: [reg], page: 1, size: 20, total: 1 } }),
    );
    await page.goto("/#partners");
    await page.reload();
    const pending = page
      .locator(".provider-tree-row")
      .filter({ hasText: "待开通S1" });
    await expect(
      pending.getByRole("button", { name: "开通", exact: true }),
    ).toHaveCount(allowed ? 1 : 0);
    const own = page
      .locator(".provider-tree-row")
      .filter({ hasText: "分公司" });
    await own.getByRole("button", { name: "分享码", exact: true }).click();
    const share = page.getByRole("dialog", { name: "分享码", exact: true });
    await expect(share).toContainText("待开通用户");
    await expect(
      share.getByRole("button", { name: "开通", exact: true }),
    ).toHaveCount(allowed ? 1 : 0);
    await share.getByRole("button", { name: "关闭", exact: true }).click();
    if (provider || allowed) {
      await own.getByRole("button", { name: "会员登记", exact: true }).click();
      const inbox = page.getByRole("dialog", { name: "会员登记", exact: true });
      await expect(inbox).toContainText("待开通用户");
      await expect(
        inbox.getByRole("button", { name: "开通", exact: true }),
      ).toHaveCount(allowed ? 1 : 0);
    } else {
      await page
        .getByRole("button", { name: "用户管理", exact: true })
        .click();
      await page.getByRole("tab", { name: "扫码登记", exact: true }).click();
      const registrations = page.getByRole("region", {
        name: "扫码登记列表",
        exact: true,
      });
      await expect(registrations).toContainText("待开通用户");
      await expect(
        registrations.getByRole("button", { name: "开通", exact: true }),
      ).toHaveCount(0);
    }
  });
}
