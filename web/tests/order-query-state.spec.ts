import { expect, test } from "@playwright/test";
import { login } from "./helpers";

for (const issued of [false, true]) {
  test(`order query explains ${issued ? "issued" : "unissued"} payment state`, async ({
    page,
  }) => {
    await login(page);
    const row = {
      id: "query-state-order",
      version: 1,
      createdAt: "2026-11-08T00:00:00Z",
      data: {
        userId: "query-state-user",
        channel: "wechat_virtual",
        status: "created",
        amountFen: 10,
        pointsUnits: 1000000,
        expiresAt: "2026-11-09T00:00:00Z",
        virtual: {
          issued,
          purchaseMode: "package",
          productName: "测试积分",
          platform: "android",
        },
      },
    };
    await page.route("**/api/admin/orders", (route) =>
      route.fulfill({ json: [row] }),
    );
    let probes = 0;
    await page.route(
      "**/api/admin/orders/query-state-order/refresh",
      (route) => {
        probes++;
        return route.fulfill({ json: row });
      },
    );
    await page.getByRole("button", { name: "充值订单", exact: true }).click();
    await page.getByRole("button", { name: "查单", exact: true }).click();
    const toast = page.getByRole("status");
    await expect(toast).toContainText(
      issued ? "订单状态已更新" : "订单尚未发起微信支付，请先在小程序发起支付",
    );
    await expect(toast).toHaveClass(issued ? /success/ : /warning/);
    expect(probes).toBe(1);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(
      page.getByRole("cell", { name: "待支付", exact: true }),
    ).toBeVisible();
  });
}

test("an issued order query error remains visible without reporting payment success", async ({
  page,
}) => {
  await login(page);
  const row = {
    id: "query-error-order",
    version: 1,
    createdAt: "2026-11-08T00:00:00Z",
    data: {
      userId: "query-user",
      channel: "wechat_virtual",
      status: "created",
      amountFen: 10,
      pointsUnits: 1000000,
      virtual: {
        issued: true,
        purchaseMode: "package",
        productName: "测试积分",
        platform: "android",
      },
    },
  };
  await page.route("**/api/admin/orders", (route) =>
    route.fulfill({ json: [row] }),
  );
  await page.route("**/api/admin/orders/query-error-order/refresh", (route) =>
    route.fulfill({
      status: 502,
      json: { error: "虚拟支付请求未确认，错误码 268490002" },
    }),
  );
  await page.getByRole("button", { name: "充值订单", exact: true }).click();
  await page.getByRole("button", { name: "查单", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("268490002");
  await expect(page.getByText("订单状态已更新", { exact: true })).toHaveCount(
    0,
  );
});
