import { expect, test, type Page } from "@playwright/test";
import { mockLogin } from "./mock-login";
import { longName, surfaceFixtures } from "./surface-fixtures";
import { registration, registrations } from "./registration-fixture";

// Captures the PUT bodies a decision sends and answers like the server.
async function decisions(page: Page) {
  const bodies: Record<string, unknown>[] = [];
  await page.route("**/api/admin/registrations/qa-user", (route) => {
    const body = route.request().postDataJSON();
    bodies.push(body);
    return route.fulfill({
      json: {
        id: "qa-user",
        version: 2,
        createdAt: "2026-11-02T00:00:00Z",
        data: { status: body.approve ? "approved" : "rejected" },
      },
    });
  });
  return bodies;
}

test.beforeEach(async ({ page }) => {
  await mockLogin(page);
  await surfaceFixtures(page, []);
  await page.getByRole("button", { name: "小程序用户", exact: true }).click();
  await page.getByRole("tab", { name: "扫码登记", exact: true }).click();
});

test("扫码登记 lists pending registrations with their source", async ({
  page,
}) => {
  const section = page.getByRole("region", { name: "扫码登记", exact: true }),
    row = section.locator("tbody tr, article.mobile-record").first();
  await expect(row).toContainText("质检登记用户");
  await expect(row).toContainText("13900000002");
  await expect(row).toContainText("会员");
  // The provider name comes from the tree; the referrer from the promo code.
  await expect(row).toContainText(longName);
  await expect(row).toContainText("推广码 · 推荐人 qa-referrer");
  await expect(row.locator(".badge")).toHaveText("待开通");
  await expect(
    row.getByRole("button", { name: "开通", exact: true }),
  ).toHaveCount(0);
  await expect(row).toContainText("等待直属上级开通");
  const filter = page.waitForRequest(
    (r) =>
      r.url().includes("/api/admin/registrations?") &&
      new URL(r.url()).searchParams.get("status") === "rejected",
  );
  await section.getByRole("button", { name: "已拒绝", exact: true }).click();
  await filter;
  const search = page.waitForRequest(
    (r) =>
      r.url().includes("/api/admin/registrations?") &&
      new URL(r.url()).searchParams.get("q") === "1390",
  );
  await section.getByPlaceholder("搜索姓名、手机号或用户编号").fill("1390");
  await search;
  await section.getByRole("button", { name: "待开通", exact: true }).click();
  await section.getByPlaceholder("搜索姓名、手机号或用户编号").fill("");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(row).toContainText("质检登记用户");
    expect(
      await section.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await section.screenshot({
      path: `../.runtime/registrations-${width}.png`,
      animations: "disabled",
    });
    await page.screenshot({
      path: `../.runtime/users-registrations-${width}.png`,
      animations: "disabled",
    });
  }
});

test("开通 confirms first; 拒绝 needs a reason", async ({ page }) => {
  await page.route("**/api/admin/registrations?*", (route) =>
    route.fulfill({
      json: registrations([registration("pending", "质检登记用户", "qa-user")]),
    }),
  );
  await page.reload();
  const bodies = await decisions(page),
    section = page.getByRole("region", { name: "扫码登记", exact: true });
  await section.getByRole("button", { name: "开通", exact: true }).click();
  const approve = page.getByRole("dialog", { name: "开通登记" });
  await expect(approve).toContainText("「质检登记用户」将以分公司角色开通");
  await approve.getByRole("button", { name: "开通", exact: true }).click();
  await expect(approve).toHaveCount(0);
  // ask() already confirmed: no second change summary.
  await expect(page.locator(".save-confirmation")).toHaveCount(0);
  await expect(page.getByText("质检登记用户 已开通")).toBeVisible();

  await section.getByRole("button", { name: "拒绝", exact: true }).click();
  const reject = page.getByRole("dialog", { name: "拒绝登记" }),
    submit = reject.getByRole("button", { name: "拒绝", exact: true });
  await expect(submit).toBeDisabled();
  await reject.getByLabel("拒绝原因").fill("资料不符");
  await submit.click();
  await expect(reject).toHaveCount(0);
  expect(bodies).toEqual([
    { approve: true, reason: "", version: 1 },
    { approve: false, reason: "资料不符", version: 1 },
  ]);
});

test("the user detail explains a member's registration and referrer", async ({
  page,
}) => {
  await page.getByRole("tab", { name: "小程序用户", exact: true }).click();
  await page
    .locator(".catalog-table tbody tr, article.mobile-record")
    .filter({ hasText: "界面质检用户" })
    .getByRole("button", { name: "详情", exact: true })
    .click();
  const source = page.locator(".user-source");
  await expect(source).toContainText("会员");
  await expect(source).toContainText("已开通");
  await expect(source).toContainText("推广码");
  await expect(source).toContainText("推荐会员");
  await expect(source).toContainText("qa-referrer");
  await expect(source).toContainText("质检分公司分公司");
  await expect(source).not.toContainText("直接开通");
});
