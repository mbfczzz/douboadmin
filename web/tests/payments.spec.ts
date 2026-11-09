import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("payment records use the real admin endpoint and refund tab stays separate", async ({
  page,
}) => {
  await login(page);
  const requests: string[] = [];
  page.on("request", (r) => requests.push(new URL(r.url()).pathname));
  await page.getByRole("button", { name: "支付管理", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "支付记录", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("暂无支付记录", { exact: true })).toBeVisible();
  expect(requests).toContain("/api/admin/payments");
  expect(requests).not.toContain("/api/admin/refunds");
  await page.getByRole("tab", { name: "退款记录", exact: true }).click();
  await expect(page.getByText("暂无退款记录", { exact: true })).toBeVisible();
  expect(requests).toContain("/api/admin/refunds");
  await page.getByRole("button", { name: "充值订单", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "充值订单", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../.runtime/payment-orders-empty.png",
    fullPage: true,
  });
});

test("isolated payment UI fixtures verify server pagination, filters and refunded receipts", async ({
  page,
}) => {
  await login(page);
  const urls: URL[] = [];
  await page.route("**/api/admin/payments?*", async (route) => {
    const url = new URL(route.request().url());
    urls.push(url);
    const pageNumber = Number(url.searchParams.get("page"));
    const filtered = !!url.searchParams.get("q");
    const count = filtered ? 1 : pageNumber === 1 ? 20 : 1;
    await route.fulfill({
      json: {
        page: pageNumber,
        size: 20,
        total: filtered ? 1 : 21,
        items: Array.from({ length: count }, (_, i) => ({
          transactionId: `test-transaction-${pageNumber}-${i}`,
          orderId: `test-order-${pageNumber}-${i}`,
          userId: "isolated-test-user",
          channel: "wechat_jsapi",
          amountFen: 123,
          pointsUnits: 12300,
          status: filtered ? "refunded" : "paid",
          paidAt: "2026-11-01T01:00:00Z",
          confirmedAt: "2026-11-01T01:01:00Z",
          refundId: filtered ? "test-refund" : "",
        })),
      },
    });
  });
  await page.getByRole("button", { name: "支付管理", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(20);
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(
    page.getByText("test-transaction-2-0", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("搜索支付记录").fill("test-transaction");
  await page.getByLabel("支付记录状态").selectOption("refunded");
  await page.getByLabel("到账开始日期", { exact: true }).fill("2026-11-01");
  await page.getByLabel("到账结束日期", { exact: true }).fill("2026-11-01");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await expect(
    page.getByText("退款单：test-refund", { exact: true }),
  ).toBeVisible();
  expect(urls.at(-1)?.searchParams.get("page")).toBe("1");
  expect(urls.at(-1)?.searchParams.get("status")).toBe("refunded");
  expect(urls.at(-1)?.searchParams.get("from")).toBe("2026-11-01");
  await expect(page.locator("tbody")).toContainText("¥1.23");
  await expect(page.locator("tbody")).toContainText("123 积分");
  await page.screenshot({
    path: "../.runtime/payment-records-test-only.png",
    fullPage: true,
  });
});
