import { expect, test } from "@playwright/test";
import { mockLogin } from "./mock-login";

test("financial values share a right edge while mobile cards keep their reading layout", async ({
  page,
}) => {
  await mockLogin(page);
  await page.route("**/api/admin/orders?*", (route) =>
    route.fulfill({
      json: {
        page: 1,
        size: 20,
        total: 3,
        items: [500, 10000, 120000].map((amountFen, i) => ({
          id: `order-${i}`,
          owner: "user-one",
          version: 1,
          createdAt: "2026-11-10T08:00:00Z",
          data: {
            userId: "user-one",
            status: "paid",
            amountFen,
            pointsUnits: amountFen * 100,
            channel: "wechat_jsapi",
          },
        })),
      },
    }),
  );
  await page.getByRole("button", { name: "充值订单", exact: true }).click();
  const table = page.getByRole("table");
  await expect(table).toBeVisible();
  await expect(
    table.getByRole("columnheader", { name: "金额 / 积分" }),
  ).toHaveCSS("text-align", "right");
  await expect(
    table.getByRole("columnheader", { name: "订单", exact: true }),
  ).toHaveCSS("text-align", "left");
  const geometry = await table.locator("tbody tr").evaluateAll((rows) =>
    rows.map((row) => {
      const amount = row.querySelector<HTMLElement>(".amount")!;
      const tag = row.querySelector<HTMLElement>(".cell-tags .tag")!;
      return {
        amountRight: amount.getBoundingClientRect().right,
        tagRight: tag.getBoundingClientRect().right,
      };
    }),
  );
  for (const value of geometry) {
    expect(value.amountRight).toBeCloseTo(geometry[0].amountRight, 0);
    expect(value.tagRight).toBeCloseTo(value.amountRight, 0);
  }
  await page.screenshot({
    path: "../.runtime/unslop-finance-desktop.png",
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 900 });
  await expect(table).toHaveCount(0);
  const cards = page.locator(".mobile-record");
  await expect(cards).toHaveCount(3);
  await expect(
    cards.first().getByText("金额 / 积分", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(
    await cards
      .first()
      .locator("dd")
      .first()
      .evaluate((el) => getComputedStyle(el).textAlign),
  ).not.toBe("right");
  await page.screenshot({
    path: "../.runtime/unslop-finance-mobile.png",
    fullPage: true,
  });
});
