import { expect, test } from "@playwright/test";
import { openRegistrations, registration } from "./registration-fixture";

test("reviewing the last item on the final page returns to a valid pending page", async ({
  page,
}) => {
  let opened = false;
  const calls: number[] = [];
  await openRegistrations(page, (route) => {
    const current = Number(
      new URL(route.request().url()).searchParams.get("page"),
    );
    calls.push(current);
    return route.fulfill({
      json: {
        items:
          current === 1
            ? Array.from({ length: 20 }, (_, i) =>
                registration("pending", `其他待开通${i}`, `pending-${i}`),
              )
            : opened
              ? []
              : [registration("pending", "最后一位待开通用户", "last-user")],
        page: current,
        size: 20,
        total: opened ? 20 : 21,
      },
    });
  });
  await page.route("**/api/admin/registrations/last-user", (route) => {
    opened = true;
    return route.fulfill({
      json: registration("approved", "最后一位待开通用户", "last-user"),
    });
  });
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  const records = page.getByRole("region", {
    name: "扫码登记列表",
    exact: true,
  });
  await expect(records).toContainText("最后一位待开通用户");
  await records.getByRole("button", { name: "开通", exact: true }).click();
  await page
    .getByRole("dialog", { name: "开通登记", exact: true })
    .getByRole("button", { name: "开通", exact: true })
    .click();
  await expect.poll(() => calls.at(-1)).toBe(1);
  await expect(records).toContainText("其他待开通0");
  await expect(records).not.toContainText("最后一位待开通用户");
  await expect(
    page.getByRole("button", { name: "下一页", exact: true }),
  ).toHaveCount(0);
});
