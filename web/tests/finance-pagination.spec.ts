import { expect, test } from "@playwright/test";
import { mockLogin } from "./mock-login";

test("orders request later server pages and reset page when filtering", async ({ page }) => {
  await mockLogin(page);
  const queries: URLSearchParams[] = [];
  await page.route("**/api/admin/orders?*", route => {
    const query = new URL(route.request().url()).searchParams;
    queries.push(query);
    const current = Number(query.get("page"));
    return route.fulfill({ json: { page: current, size: 20, total: 521, items: [{
      id: `order-page-${current}`, version: 1, createdAt: "2026-11-10T00:00:00Z",
      data: { userId: "user-one", status: query.get("status") || "paid", amountFen: 100, pointsUnits: 10000 },
    }] } });
  });
  await page.getByRole("button", { name: "充值订单", exact: true }).click();
  await expect(page.getByText("order-page-1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.getByText("order-page-2", { exact: true })).toBeVisible();
  await expect(page.getByText("order-page-1", { exact: true })).toHaveCount(0);
  await page.getByLabel("订单状态").selectOption("refunded");
  await expect(page.getByText("order-page-1", { exact: true })).toBeVisible();
  expect(queries.at(-1)?.get("status")).toBe("refunded");
  expect(queries.at(-1)?.get("page")).toBe("1");
});

test("refund list requests page 2 instead of slicing the first response", async ({ page }) => {
  await mockLogin(page);
  await page.route("**/api/admin/refunds?*", route => {
    const current = Number(new URL(route.request().url()).searchParams.get("page"));
    return route.fulfill({ json: { page: current, size: 20, total: 501, items: [{
      id: `refund-page-${current}`, createdAt: "2026-11-10T00:00:00Z", version: 1,
      data: { orderId: "order-id", amountFen: 100, status: "succeeded", reason: "测试退款" },
    }] } });
  });
  await page.getByRole("button", { name: "支付管理", exact: true }).click();
  await page.getByRole("tab", { name: "退款记录", exact: true }).click();
  await expect(page.getByRole("cell", { name: "refund-page-1 order-id", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.getByRole("cell", { name: "refund-page-2 order-id", exact: true })).toBeVisible();
});

test("points logs use server page size 30 so 60 entries end on page 2", async ({ page }) => {
  await mockLogin(page);
  await page.route("**/api/admin/audit/points?*", route => {
    const current = Number(new URL(route.request().url()).searchParams.get("page"));
    return route.fulfill({ json: { page: current, size: 30, total: 60, items: [{
      id: `ledger-${current}`, owner: "user-one", version: 1, createdAt: "2026-11-10T00:00:00Z",
      data: { kind: "topup", availableDelta: 100, heldDelta: 0, availableAfter: 100, heldAfter: 0, note: "测试积分" },
    }] } });
  });
  await page.getByRole("button", { name: "日志管理", exact: true }).click();
  await page.getByRole("tab", { name: "积分变动", exact: true }).click();
  await expect(page.getByText("1 / 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.getByText("2 / 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "下一页", exact: true })).toBeDisabled();
});
