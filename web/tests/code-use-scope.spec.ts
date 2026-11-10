import { expect, test } from "@playwright/test";
import { codes, openCodes, titles } from "./provider-code-fixture";
import { qr } from "./surface-fixtures";

test("reset and tab changes scope usage and memberships to the visible code", async ({
  page,
}) => {
  const { dialog } = await openCodes(page);
  const usage: URLSearchParams[] = [],
    members: URLSearchParams[] = [];
  await page.route("**/code-provider/code-uses?*", (route) => {
    const query = new URL(route.request().url()).searchParams;
    usage.push(query);
    return route.fulfill({ json: { items: [], page: 1, size: 20, total: 0 } });
  });
  await page.route("**/api/admin/memberships?*", (route) => {
    members.push(new URL(route.request().url()).searchParams);
    return route.fulfill({ json: { items: [], page: 1, size: 20, total: 0 } });
  });
  await dialog.getByRole("button", { name: "刷新扫码记录" }).click();
  await expect.poll(() => usage.at(-1)?.get("code")).toBe(codes.s1);
  expect(members).toHaveLength(0);
  let current = codes.s1;
  await page.route("**/codes/s1", (route) => {
    if (route.request().method() === "POST") current = "RSTU6789";
    return route.fulfill({ json: { code: current, qr } });
  });
  await dialog.getByRole("button", { name: "重置", exact: true }).click();
  await page
    .getByRole("dialog", { name: `重置${titles.s1}？` })
    .getByRole("button", { name: "重置", exact: true })
    .click();
  await expect(dialog.locator(".share-code")).toHaveText("RSTU-6789");
  await expect.poll(() => usage.at(-1)?.get("code")).toBe(current);
  await dialog.getByRole("tab", { name: titles.member, exact: true }).click();
  await expect.poll(() => usage.at(-1)?.get("code")).toBe(codes.member);
  await expect.poll(() => members.at(-1)?.get("code")).toBe(codes.member);
  expect(members.at(-1)?.get("provider")).toBe("code-provider");
  await expect(
    dialog.getByRole("heading", { name: "已加入的会员" }),
  ).toBeVisible();
  await dialog.getByRole("tab", { name: titles.s2, exact: true }).click();
  await expect.poll(() => usage.at(-1)?.get("code")).toBe(codes.s2);
  await expect(
    dialog.getByRole("heading", { name: "已加入的会员" }),
  ).toHaveCount(0);
  expect(usage.every((query) => !!query.get("code"))).toBe(true);
});

test("a used owner-binding code still scopes its records and unbinding selects the new code", async ({
  page,
}) => {
  const { dialog } = await openCodes(page, "branch", true);
  const queries: URLSearchParams[] = [];
  let code = "ABCD6789",
    bound = true;
  await page.route("**/codes/bind", (route) => {
    if (route.request().method() === "DELETE") {
      code = "RSTU6789";
      bound = false;
    }
    return route.fulfill({
      json: bound
        ? {
            code,
            user: {
              id: "pending-owner",
              name: "待开通负责人",
              phone: "13900139004",
            },
            pending: true,
          }
        : { code, qr },
    });
  });
  await page.route("**/code-provider/code-uses?*", (route) => {
    queries.push(new URL(route.request().url()).searchParams);
    return route.fulfill({ json: { items: [], page: 1, size: 20, total: 0 } });
  });
  const owner = dialog.locator(".owner-bind");
  await owner.locator("summary").click();
  await expect(owner).toContainText("待开通负责人");
  await expect.poll(() => queries.at(-1)?.get("code")).toBe("ABCD6789");
  expect(queries.at(-1)?.get("kind")).toBe("bind");
  await owner.getByRole("button", { name: "解除绑定", exact: true }).click();
  await page
    .getByRole("dialog", { name: "解除绑定？" })
    .getByRole("button", { name: "解除绑定", exact: true })
    .click();
  await expect(owner.locator(".share-code")).toHaveText("RSTU-6789");
  await expect.poll(() => queries.at(-1)?.get("code")).toBe("RSTU6789");
  expect(queries.every((query) => !!query.get("code"))).toBe(true);
});
