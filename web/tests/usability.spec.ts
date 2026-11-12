import { test, expect } from "@playwright/test";
import { login, usersList, usersPage } from "./helpers";
import { pagedFixture } from "./paged-fixture";

test("page location survives reload, supports history and resets scroll", async ({
  page,
}) => {
  await login(page);
  const response = await page.request.get("/api/admin/models"),
    models = await response.json(),
    source = models[0];
  await page.route("**/api/admin/models?*", (route) =>
    route.fulfill({
      json: pagedFixture(Array.from({ length: 25 }, (_, i) => ({
        ...source,
        id: `paging-model-${i}`,
        data: {
          ...source.data,
          name: `${source.data.name} ${i + 1}`,
          key: `${source.data.key}-${i + 1}`,
        },
      })), new URL(route.request().url())),
    }),
  );
  await page.getByRole("button", { name: "模型管理", exact: true }).click();
  await expect(page).toHaveURL(/#models$/);
  await expect(page.locator(".catalog-switch").first()).toBeVisible();
  const track = await page.locator(".catalog-switch").first().boundingBox();
  const thumb = await page
    .locator(".catalog-switch span")
    .first()
    .boundingBox();
  expect(thumb!.x).toBeGreaterThanOrEqual(track!.x);
  expect(thumb!.x + thumb!.width).toBeLessThanOrEqual(track!.x + track!.width);
  // The list has no inner scroll box; paging brings its top back into view.
  const modelTable = page.locator(".table-scroll");
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(modelTable).toBeInViewport();
  expect((await modelTable.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole("button", { name: "用户管理", exact: true }).click();
  await expect(page).toHaveURL(/#users$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "用户管理", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "模型管理", exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: "用户管理", exact: true }),
  ).toBeVisible();
});

test("mobile navigation closes accessibly and keeps page actions available", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const menu = page.getByRole("button", { name: "切换菜单", exact: true });
  const drawer = page.getByRole("dialog", { name: "工作空间导航" });
  const menuBox = await menu.boundingBox();
  expect(menuBox!.width).toBeGreaterThanOrEqual(44);
  expect(menuBox!.height).toBeGreaterThanOrEqual(44);
  await expect(
    page.getByRole("button", { name: "刷新", exact: true }),
  ).toBeVisible();
  await menu.click();
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("button", { name: "关闭菜单" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(drawer.getByRole("button", { name: "退出登录" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(drawer.getByRole("button", { name: "关闭菜单" })).toBeFocused();
  await expect(page.locator("main")).toHaveAttribute("inert", "");
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(menu).toBeFocused();
  await menu.click();
  await page.mouse.click(375, 400);
  await expect(drawer).toHaveCount(0);
  await menu.click();
  await drawer.getByRole("button", { name: "支付管理", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "充值与积分设置" }),
  ).toBeVisible();
  await menu.click();
  await drawer.getByRole("button", { name: "服务商管理", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "服务商列表", exact: true }),
  ).toBeVisible();
  await menu.click();
  await drawer.getByRole("button", { name: "用户管理", exact: true }).click();
  await expect(page.getByLabel("搜索用户")).toBeVisible();
  await menu.click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(drawer).toHaveCount(0);
  await expect(page.locator("main")).not.toHaveAttribute("inert", "");
});

test("failed lists never claim to be empty and polling preserves table position", async ({
  page,
}) => {
  await login(page);
  let fail = true;
  let release: (() => void) | undefined;
  let delayed = false;
  await page.route(usersList, async (route) => {
    if (delayed)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    await route.fulfill(
      fail
        ? { status: 503, json: { error: "读取用户失败" } }
        : {
            json: usersPage(route.request().url(), [
              {
                id: "ui-user",
                version: 1,
                createdAt: new Date().toISOString(),
                data: { nickname: "界面验收" },
              },
            ]),
          },
    );
  });
  await page.getByRole("button", { name: "用户管理", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText("暂无用户", { exact: true })).toHaveCount(0);
  await expect(page.getByText("共 0 条", { exact: true })).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "界面验收 ui-user", exact: true }),
  ).toBeVisible();
  const top = (await page.locator(".table-scroll").boundingBox())!.y;
  delayed = true;
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await expect.poll(() => Boolean(release)).toBeTruthy();
  expect((await page.locator(".table-scroll").boundingBox())!.y).toBe(top);
  release!();
  await expect(
    page.getByRole("button", { name: "刷新", exact: true }),
  ).toBeEnabled();
});

test("local filters return to page one and single page lists hide useless controls", async ({
  page,
}) => {
  await login(page);
  const users = Array.from({ length: 60 }, (_, i) => ({
    id: `user-${i}`,
    version: 1,
    createdAt: new Date().toISOString(),
    data: { nickname: `${i < 30 ? "A" : "B"} 用户 ${i}` },
  }));
  await page.route(usersList, (route) =>
    route.fulfill({ json: usersPage(route.request().url(), users) }),
  );
  await page.getByRole("button", { name: "用户管理", exact: true }).click();
  const userTable = page.locator(".table-scroll");
  await expect(page.getByText("user-0", { exact: true })).toBeVisible();
  // The page scrolls (no inner box); paging brings the list top back.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(userTable).toBeInViewport();
  expect((await userTable.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  await expect(page.getByText("user-20", { exact: true })).toBeVisible();
  await page.getByLabel("搜索用户").fill("A");
  await expect(page.getByText("user-0", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "上一页", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("搜索用户").fill("A 用户 0");
  await expect(
    page.getByRole("button", { name: "下一页", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("搜索用户").fill("不存在的用户");
  await expect(page.getByText("没有匹配的用户，请调整搜索条件")).toBeVisible();
});

test("browser back first dismisses the mobile drawer and unlocks the page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const menu = page.getByRole("button", { name: "切换菜单", exact: true });
  const drawer = page.getByRole("dialog", { name: "工作空间导航" });
  await menu.click();
  await drawer.getByRole("button", { name: "用户管理", exact: true }).click();
  await expect(page).toHaveURL(/#users$/);
  await menu.click();
  await expect(drawer).toBeVisible();
  await page.goBack();
  await expect(drawer).toHaveCount(0);
  await expect(page).toHaveURL(/#users$/);
  await expect(page.locator("main")).not.toHaveAttribute("inert", "");
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
    "hidden",
  );
  await expect(menu).toBeFocused();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "工作概览", exact: true }),
  ).toBeVisible();
});
