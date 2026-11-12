import { expect, test } from "@playwright/test";
import { codes, openCodes } from "./provider-code-fixture";

test("super administrators open pending members from a retired QR code", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  const { dialog } = await openCodes(page);
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  let status = "pending";
  const writes: unknown[] = [];
  const reg = () => ({
    id: "old-code-member",
    version: 9,
    data: {
      role: "member",
      name: "旧码登记会员",
      phone: "13900139004",
      codeKind: "",
      code: "QRST6789",
      partnerId: "code-provider",
      method: "scan",
      status,
      canReview: true,
    },
  });
  await page.route("**/code-provider/member-registrations?*", (route) =>
    route.fulfill({
      json: {
        items:
          new URL(route.request().url()).searchParams.get("status") === status
            ? [reg()]
            : [],
        page: 1,
        total: status === "pending" ? 1 : 0,
      },
    }),
  );
  await page.route("**/api/admin/partners/tree", (route) =>
    route.fulfill({
      json: [{ id: "code-provider", data: { name: "本服务商" } }],
    }),
  );
  await page.route("**/api/admin/registrations/old-code-member", (route) => {
    writes.push(route.request().postDataJSON());
    status = "approved";
    return route.fulfill({ json: reg() });
  });
  await page.getByRole("button", { name: "会员登记", exact: true }).click();
  const inbox = page.getByRole("dialog", { name: "会员登记", exact: true });
  await expect(inbox).toContainText("旧码登记会员");
  expect(
    await inbox.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await inbox.screenshot({
    path: "../.runtime/member-review-inbox-320.png",
    animations: "disabled",
  });
  expect(reg().data.code).not.toBe(codes.member);
  await inbox.getByRole("button", { name: "开通", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "开通登记", exact: true });
  await expect(confirm).toBeVisible();
  expect(writes).toHaveLength(0);
  await confirm.getByRole("button", { name: "开通", exact: true }).click();
  await expect(inbox.getByText("暂无登记", { exact: true })).toBeVisible();
  expect(writes).toEqual([{ approve: true, reason: "", version: 9 }]);
});
