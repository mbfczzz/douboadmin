import { expect, test } from "@playwright/test";
import { mockLogin } from "./mock-login";

test("a stale provider row cannot open the same user's newer provider registration", async ({
  page,
}) => {
  await mockLogin(page);
  await page.route("**/api/admin/me", (route) =>
    route.fulfill({
      json: {
        id: "super-login",
        role: "super_admin",
        scope: "platform",
        menus: ["partners"],
      },
    }),
  );
  let loadedNew = false,
    writes = 0;
  const node = (id: string, name: string) => ({
    id,
    version: 1,
    children: 0,
    data: {
      name,
      role: "s1",
      parentId: "branch",
      ownerUser: "same-user",
      status: "pending",
      path: ["root", "branch"],
    },
  });
  await page.route("**/api/admin/partners/tree?*", (route) =>
    route.fulfill({
      json: {
        items: [
          loadedNew
            ? node("new-provider", "新S1")
            : node("old-provider", "旧S1"),
        ],
        page: 1,
        total: 1,
      },
    }),
  );
  await page.route("**/api/admin/registrations/same-user", (route) => {
    if (route.request().method() === "PUT") writes++;
    loadedNew = true;
    return route.fulfill({
      json: {
        id: "same-user",
        version: 6,
        data: {
          role: "s1",
          partnerId: "new-provider",
          name: "新S1",
          code: "ABCD2345",
          status: "pending",
        },
      },
    });
  });
  await page.goto("/#partners");
  await page.reload();
  await page
    .locator(".provider-tree-row")
    .filter({ hasText: "旧S1" })
    .getByRole("button", { name: "开通", exact: true })
    .click();
  await expect(
    page.getByText("该登记已更新，请刷新后重试", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "开通登记", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".provider-tree-row")).toContainText("新S1");
  expect(writes).toBe(0);
});
