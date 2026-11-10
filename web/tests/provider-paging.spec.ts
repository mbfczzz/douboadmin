import { expect, test } from "@playwright/test";
import { mockLogin as login } from "./mock-login";

test("provider tree fetches child pages only on expansion and searches all providers", async ({
  page,
}) => {
  await login(page);
  const requests: string[] = [];
  const row = (id: string, name: string, parent = "root", children = 0) => ({
    id,
    children,
    version: 1,
    createdAt: "2026-11-10T00:00:00Z",
    data: {
      name,
      parentId: parent,
      path: [],
      role: parent === "root" ? "branch" : "s1",
      status: "active",
    },
  });
  await page.route("**/api/admin/partners/tree?**", (route) => {
    const url = new URL(route.request().url());
    requests.push(url.search);
    const parent = url.searchParams.get("parent"),
      current = Number(url.searchParams.get("page"));
    const items = url.searchParams.get("q")
      ? [row("old-provider", "历史服务商")]
      : parent
        ? [
            row(
              current === 1 ? "child-one" : "child-two",
              current === 1 ? "第一页下级" : "第二页下级",
              "parent-one",
            ),
          ]
        : [row("parent-one", "总部服务商", "root", 21)];
    return route.fulfill({
      json: { items, page: current, size: 20, total: parent ? 21 : 1 },
    });
  });
  await page.getByRole("button", { name: "服务商管理", exact: true }).click();
  await expect(page.getByText("总部服务商", { exact: true })).toBeVisible();
  expect(requests.some((q) => q.includes("parent="))).toBe(false);
  await page.getByRole("button", { name: "展开总部服务商" }).click();
  await expect(page.getByText("第一页下级", { exact: true })).toBeVisible();
  await expect(
    page.locator(".provider-tree-children .catalog-pagination"),
  ).toContainText("共 21 条");
  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page.getByText("第二页下级", { exact: true })).toBeVisible();
  expect(
    requests.some(
      (q) => q.includes("parent=parent-one") && q.includes("page=2"),
    ),
  ).toBe(true);
  await page.getByRole("searchbox", { name: "搜索服务商" }).fill("历史");
  await expect(page.getByText("历史服务商", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("single-page child lists do not repeat totals between provider rows", async ({
  page,
}) => {
  await login(page);
  const row = (id: string, name: string, role: string, children = 0) => ({
    id,
    children,
    version: 1,
    createdAt: "2026-11-10T00:00:00Z",
    data: { name, role, status: "active", parentId: "root", path: [] },
  });
  await page.route("**/api/admin/partners/tree?**", (route) => {
    const parent = new URL(route.request().url()).searchParams.get("parent");
    const items =
      parent === "branch"
        ? [row("s1", "S1 服务商", "s1", 1)]
        : parent === "s1"
          ? [row("s2", "S2 推荐官", "s2")]
          : [
              row("branch", "分公司", "branch", 1),
              row("other", "其他分公司", "branch"),
            ];
    return route.fulfill({
      json: { items, page: 1, size: 20, total: items.length },
    });
  });
  await page.getByRole("button", { name: "服务商管理", exact: true }).click();
  await page.getByRole("button", { name: "展开分公司", exact: true }).click();
  await page
    .getByRole("button", { name: "展开S1 服务商", exact: true })
    .click();
  const tree = page.locator(".provider-tree");
  await expect(tree.getByText("S2 推荐官", { exact: true })).toBeVisible();
  await expect(tree.locator(".provider-tree-row")).toHaveCount(4);
  await expect(
    tree.locator(".provider-tree-children .catalog-pagination"),
  ).toHaveCount(0);
  await expect(tree.locator(".catalog-pagination")).toHaveCount(1);
  await expect(tree.locator(".catalog-pagination")).toHaveText("共 2 条");
  await expect(tree.getByText("共 1 条", { exact: true })).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({
      path: `../.runtime/provider-child-counts-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "收起分公司", exact: true }).click();
  await expect(tree.locator(".provider-tree-row")).toHaveCount(2);
  await expect(tree.locator(".catalog-pagination")).toHaveText("共 2 条");
});

test("admin accounts and roles request the selected server page", async ({
  page,
}) => {
  await login(page);
  const fetched: string[] = [];
  await page.route("**/api/admin/accounts?**", (route) => {
    const current = Number(
      new URL(route.request().url()).searchParams.get("page"),
    );
    fetched.push(`accounts:${current}`);
    return route.fulfill({
      json: {
        page: current,
        total: 21,
        size: 20,
        canManage: true,
        items: [
          {
            id: `account-${current}`,
            version: 1,
            data: {
              username: `login-${current}`,
              name: `第${current}页管理员`,
              role: "operator",
            },
          },
        ],
      },
    });
  });
  await page.route("**/api/admin/roles**", (route) => {
    const query = new URL(route.request().url()).searchParams;
    const current = Number(query.get("page") || 1);
    fetched.push(`roles:${current}`);
    const items = [
      {
        id: `role-${current}`,
        version: 1,
        accounts: 1,
        data: {
          name: `第${current}页角色`,
          scope: "platform",
          menus: ["overview"],
        },
      },
    ];
    return route.fulfill({
      json: query.has("page")
        ? { page: current, total: 21, size: 20, items }
        : items,
    });
  });
  await page.getByRole("button", { name: "管理账号", exact: true }).click();
  await expect(
    page.getByRole("cell").filter({ hasText: "第1页管理员" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "下一页" }).click();
  await expect(
    page.getByRole("cell").filter({ hasText: "第2页管理员" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "角色管理", exact: true }).click();
  await expect(page.getByText("第1页角色", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page.getByText("第2页角色", { exact: true })).toBeVisible();
  expect(fetched).toContain("accounts:2");
  expect(fetched).toContain("roles:2");
});
