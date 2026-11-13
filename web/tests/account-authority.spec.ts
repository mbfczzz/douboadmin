import { test, expect } from "@playwright/test";
import { mockLogin } from "./mock-login";

for (const role of ["operator", "branch", "s1", "s2"]) {
  test(`${role}: only subordinate pricing, activity and commission remain`, async ({
    page,
  }) => {
    await mockLogin(page);
    await page.route("**/api/admin/me", (r) =>
      r.fulfill({
        json: {
          id: "caller",
          role,
          scope: role === "operator" ? "platform" : "partner",
          partnerId: role === "operator" ? undefined : "parent",
          menus: ["accounts", "users", "partners", "settings", "logs"],
          canManageAccounts: false,
          canApproveRegistrations: false,
        },
      }),
    );
    const child = {
      id: "child",
      version: 1,
      children: 0,
      data: {
        name: "下级服务商",
        role: "s1",
        parentId: "parent",
        path: ["root", "parent"],
        status: "active",
        childMarginBps: 2000,
        retailPer100Fen: 10000,
      },
    };
    await page.route("**/api/admin/partners/tree?*", (r) =>
      r.fulfill({ json: { items: [child], total: 1, page: 1 } }),
    );
    await page.route("**/api/admin/partners/child", (r) =>
      r.fulfill({
        json: {
          record: child,
          price: { shares: [] },
          commission: { balanceFen: 10000, heldFen: 0, paidOutFen: 0 },
        },
      }),
    );
    await page.route("**/api/admin/commission-*?*", (r) =>
      r.fulfill({ json: { items: [], total: 0, page: 1, size: 20 } }),
    );
    await page.route("**/api/admin/partners/child/activity?*", (r) =>
      r.fulfill({
        json: {
          items: [
            {
              id: "trace",
              at: "2026-11-13T08:00:00Z",
              category: "business",
              action: "设置分佣",
              actorName: "下级账号",
              summary: "调整下级比例",
              status: 200,
              request: "PRIVATE-BODY",
            },
          ],
        },
      }),
    );
    await page.goto("/#partners");
    await page.reload();
    for (const name of [
      "管理账号",
      "用户管理",
      "系统设置",
      "日志管理",
      "新增分公司",
    ])
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
        0,
      );
    const row = page
      .locator(".provider-tree-row")
      .filter({ hasText: "下级服务商" });
    await expect(row.getByRole("button")).toHaveText([
      "分佣比例",
      "下级活动轨迹",
      "查看分佣",
    ]);
    await row.getByRole("button", { name: "下级活动轨迹" }).click();
    const activity = page.getByRole("dialog", {
      name: "下级活动轨迹",
      exact: true,
    });
    await expect(activity).toContainText("调整下级比例");
    await expect(activity).toContainText("下级账号");
    await activity.getByRole("button", { name: "详情", exact: true }).click();
    const detail = page.getByRole("dialog", { name: "活动详情" });
    await expect(detail).not.toContainText("PRIVATE-BODY");
    await detail.getByRole("button", { name: "关闭", exact: true }).click();
    await activity.getByRole("button", { name: "关闭", exact: true }).click();
    await row.getByRole("button", { name: "查看分佣" }).click();
    const commission = page.getByRole("dialog", {
      name: "算力分佣",
      exact: true,
    });
    await expect(commission).toContainText("佣金流水");
    await expect(
      commission.getByRole("button", { name: "申请提现", exact: true }),
    ).toHaveCount(0);
    await expect(
      commission.getByRole("button", { name: "确认打款", exact: true }),
    ).toHaveCount(0);
  });
}
