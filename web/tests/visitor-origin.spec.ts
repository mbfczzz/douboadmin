import { expect, test } from "@playwright/test";
import { mockLogin } from "./mock-login";

test("user list distinguishes direct, scanned and adjusted visitors", async ({
  page,
}) => {
  await mockLogin(page);
  const visitor = (id: string, nickname: string, visitorOrigin?: string) => ({
    id,
    version: 1,
    createdAt: "2026-11-24T10:00:00Z",
    data: {
      nickname,
      name: nickname,
      phone: "13900139000",
      availableUnits: 0,
      access: {
        active: false,
        status: "review",
        ...(visitorOrigin ? { visitorOrigin } : {}),
      },
    },
  });
  await page.route("**/api/admin/users?*", (route) =>
    route.fulfill({
      json: {
        items: [
          visitor("direct", "直接用户", "direct"),
          visitor("scan", "扫码用户", "scan"),
          visitor("code", "邀请码用户", "code"),
          visitor("admin", "调整用户", "admin"),
          visitor("review", "普通待审用户"),
        ],
        page: 1,
        size: 20,
        total: 5,
      },
    }),
  );
  await page.getByRole("button", { name: "用户管理", exact: true }).click();
  for (const label of [
    "直接注册游客",
    "扫码注册游客",
    "邀请码注册游客",
    "身份调整游客",
  ])
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  await expect(page.getByText("游客 · 待开通", { exact: true })).toBeVisible();
  await expect(page.getByText("待审核开通", { exact: true })).toHaveCount(0);
});
