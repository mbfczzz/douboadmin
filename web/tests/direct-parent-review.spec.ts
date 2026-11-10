import { expect, test } from "@playwright/test";
import { codes, openCodes, titles } from "./provider-code-fixture";
import { mockLogin } from "./mock-login";

test("an old usage record cannot approve a newer registration", async ({
  page,
}) => {
  const { dialog } = await openCodes(page, "branch", false, true);
  let writes = 0;
  await page.route("**/code-provider/code-uses?*", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "old-use",
            version: 1,
            data: {
              userId: "changed-user",
              name: "旧登记用户",
              code: codes.s1,
              role: "s1",
              status: "pending",
            },
          },
        ],
        page: 1,
        size: 20,
        total: 1,
      },
    }),
  );
  await page.route("**/api/admin/registrations/changed-user", (route) => {
    if (route.request().method() === "PUT") writes++;
    return route.fulfill({
      json: {
        id: "changed-user",
        version: 12,
        data: {
          name: "新登记用户",
          role: "member",
          code: codes.member,
          status: "pending",
        },
      },
    });
  });
  const records = dialog.getByRole("region", {
    name: "扫码登记记录",
    exact: true,
  });
  await records.getByRole("button", { name: "刷新扫码记录" }).click();
  await records.getByRole("button", { name: "开通", exact: true }).click();
  await expect(
    page.getByText("该登记已更新，请刷新后重试", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "开通登记", exact: true }),
  ).toHaveCount(0);
  expect(writes).toBe(0);
});

for (const kind of ["s1", "s2", "member"] as const) {
  test(`a provider reviews its own ${kind} scans using the registration version`, async ({
    page,
  }) => {
    if (kind === "member")
      await page.setViewportSize({ width: 320, height: 1000 });
    const { dialog } = await openCodes(page, "branch", false, true);
    let status = "pending";
    const writes: unknown[] = [];
    const reg = () => ({
      id: "scan-user",
      version: 17,
      data: {
        role: kind === "member" ? "member" : kind,
        code: codes[kind],
        name: "待开通用户",
        status,
      },
    });
    await page.route("**/code-provider/code-uses?*", (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: "usage-row",
              version: 3,
              data: {
                ...reg().data,
                userId: "scan-user",
                phone: "13900139004",
                codeKind: kind,
                method: "scan",
                registeredAt: "2026-11-10T00:00:00Z",
              },
            },
          ],
          page: 1,
          size: 20,
          total: 1,
        },
      }),
    );
    await page.route("**/api/admin/registrations/scan-user", (route) => {
      if (route.request().method() === "PUT") {
        const body = route.request().postDataJSON();
        writes.push(body);
        status = body.approve ? "approved" : "rejected";
      }
      return route.fulfill({ json: reg() });
    });
    if (kind !== "s1")
      await dialog
        .getByRole("tab", { name: titles[kind], exact: true })
        .click();
    const records = dialog.getByRole("region", {
      name: "扫码登记记录",
      exact: true,
    });
    await records.getByRole("button", { name: "刷新扫码记录" }).click();
    await expect(
      records.getByText("待开通用户", { exact: true }),
    ).toBeVisible();
    expect(
      await records.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    if (kind === "member")
      await records.screenshot({
        path: "../.runtime/direct-review-member-320.png",
      });
    const approve = kind !== "s2";
    const label = approve ? "开通" : "拒绝";
    await records.getByRole("button", { name: label, exact: true }).click();
    const confirmation = page.getByRole("dialog", {
      name: label + "登记",
      exact: true,
    });
    await expect(confirmation).toBeVisible();
    expect(writes).toHaveLength(0);
    if (!approve) {
      await expect(
        confirmation.getByRole("button", { name: label, exact: true }),
      ).toBeDisabled();
      await confirmation.getByLabel("拒绝原因").fill("资料不符");
    }
    await confirmation
      .getByRole("button", { name: label, exact: true })
      .click();
    await expect(confirmation).toHaveCount(0);
    await expect(
      records.getByRole("button", { name: label, exact: true }),
    ).toHaveCount(0);
    expect(writes).toEqual([
      { approve, reason: approve ? "" : "资料不符", version: 17 },
    ]);
    await expect(page.locator(".save-confirmation")).toHaveCount(0);
  });
}

test("provider rows offer opening only for the direct parent and refresh after confirmation", async ({
  page,
}) => {
  await mockLogin(page);
  await page.route("**/api/admin/me", (route) =>
    route.fulfill({
      json: {
        id: "branch-login",
        role: "partner",
        scope: "partner",
        partnerId: "branch",
        menus: ["partners"],
        name: "分公司负责人",
      },
    }),
  );
  let opened = false;
  const writes: unknown[] = [];
  const node = (id: string, parentId: string, role: string) => ({
    id,
    version: 3,
    children: 0,
    data: {
      name: id,
      parentId,
      role,
      ownerUser: id + "-owner",
      status: id === "直属S1" && opened ? "active" : "pending",
      path: [],
      retailPer100Fen: 10000,
      childMarginBps: 5000,
    },
  });
  await page.route("**/api/admin/partners/tree?*", (route) =>
    route.fulfill({
      json: {
        items: [node("直属S1", "branch", "s1"), node("隔级S2", "s1", "s2")],
        page: 1,
        total: 2,
      },
    }),
  );
  await page.route("**/api/admin/registrations/*", (route) => {
    if (route.request().method() === "PUT") {
      writes.push(route.request().postDataJSON());
      opened = true;
    }
    return route.fulfill({
      json: {
        id: "直属S1-owner",
        version: 8,
        data: {
          name: "直属S1",
          partnerId: "直属S1",
          role: "s1",
          status: opened ? "approved" : "pending",
        },
      },
    });
  });
  await page.goto("/#partners");
  await page.reload();
  const direct = page
    .locator(".provider-tree-row")
    .filter({ hasText: "直属S1" });
  const indirect = page
    .locator(".provider-tree-row")
    .filter({ hasText: "隔级S2" });
  await expect(indirect).toContainText("等待上级开通");
  await expect(
    indirect.getByRole("button", { name: "开通", exact: true }),
  ).toHaveCount(0);
  await direct.getByRole("button", { name: "开通", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "开通登记", exact: true });
  await expect(confirm).toBeVisible();
  expect(writes).toHaveLength(0);
  await confirm.getByRole("button", { name: "开通", exact: true }).click();
  await expect(direct).toContainText("已启用");
  expect(writes).toEqual([{ approve: true, reason: "", version: 8 }]);
});
