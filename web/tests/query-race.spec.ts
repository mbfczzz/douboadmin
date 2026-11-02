import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("a delayed earlier query cannot overwrite the current records", async ({
  page,
}) => {
  await login(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let slowStarted = false,
    slowFinished = false;
  await page.route("**/api/admin/payments?*", async (route) => {
    const q = new URL(route.request().url()).searchParams.get("q") || "initial";
    if (q === "slow") {
      slowStarted = true;
      await pending;
    }
    await route.fulfill({
      json: {
        page: 1,
        size: 20,
        total: 1,
        items: [
          {
            transactionId: q,
            orderId: "fixture-order",
            userId: "fixture-user",
            channel: "wechat_jsapi",
            amountFen: 100,
            pointsUnits: 10000,
            status: "paid",
            paidAt: "2026-11-01T01:00:00Z",
            confirmedAt: "2026-11-01T01:00:00Z",
          },
        ],
      },
    });
    if (q === "slow") slowFinished = true;
  });
  await page.getByRole("button", { name: "支付管理", exact: true }).click();
  await expect(page.getByText("initial", { exact: true })).toBeVisible();
  await page.getByLabel("搜索支付记录").fill("slow");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await expect.poll(() => slowStarted).toBeTruthy();
  await expect(page.getByText("initial", { exact: true })).toHaveCount(0);
  await page.getByLabel("搜索支付记录").fill("latest");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await expect(page.getByText("latest", { exact: true })).toBeVisible();
  release();
  await expect.poll(() => slowFinished).toBeTruthy();
  await expect(page.getByText("latest", { exact: true })).toBeVisible();
  await expect(page.getByText("slow", { exact: true })).toHaveCount(0);
});
