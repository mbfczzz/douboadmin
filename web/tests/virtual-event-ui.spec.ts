import { expect, test, type Page } from "@playwright/test";
import { confirmSubmission, login } from "./helpers";
import { surfaceFixtures } from "./surface-fixtures";

async function fixture(page: Page) {
  await login(page);
  await surfaceFixtures(page);
  const writes: Array<{ action: string; body: unknown }> = [];
  let status = "pending";
  await page.route("**/api/admin/virtual-payments/events**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      writes.push({
        action: request.url().split("/").pop()!,
        body: request.postDataJSON(),
      });
      status = request.url().endsWith("review") ? "reviewed" : "done";
      return route.fulfill({ json: { ok: true } });
    }
    const filter = new URL(request.url()).searchParams.get("status");
    const items =
      !filter || filter === status
        ? [
            {
              id: "event-fixture",
              version: 3,
              createdAt: "2026-11-06T00:00:00Z",
              data: {
                event: "xpay_refund_notify",
                orderId: "a".repeat(32),
                refundId: "b".repeat(32),
                amountFen: 100,
                status,
                lastError:
                  "平台退款已收到，但本地积分不足，需要核对积分消费和退款记录。".repeat(
                    3,
                  ),
              },
            },
          ]
        : [];
    return route.fulfill({
      json: { items, total: items.length, page: 1, size: 20 },
    });
  });
  await page.getByRole("button", { name: "支付管理", exact: true }).click();
  await page.getByRole("tab", { name: "虚拟支付异常" }).click();
  return writes;
}

for (const width of [1440, 390]) {
  test(`payment exception review keeps long data and actions reachable at ${width}px`, async ({
    page,
  }) => {
    const writes = await fixture(page);
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("button", { name: "人工核对", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "人工核对" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "保存核对说明" }),
    ).toBeDisabled();
    await dialog
      .getByLabel("核对说明")
      .fill("已核对微信交易和消费记录，已联系用户处理");
    await expect(
      dialog.getByRole("button", { name: "保存核对说明" }),
    ).toBeEnabled();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `../.runtime/virtual-event-review-${width}.png`,
      fullPage: true,
    });
    await dialog.getByRole("button", { name: "保存核对说明" }).click();
    await confirmSubmission(page);
    await expect(dialog).toHaveCount(0);
    expect(writes).toEqual([
      {
        action: "review",
        body: { version: 3, note: "已核对微信交易和消费记录，已联系用户处理" },
      },
    ]);
    await expect(page.getByText("暂无此状态的支付异常")).toBeVisible();
  });
}

test("payment exception retry uses original event and refreshes results", async ({
  page,
}) => {
  const writes = await fixture(page);
  // Retry is its own row button: one approval, no extra dialog.
  await page.getByRole("button", { name: "重试处理", exact: true }).click();
  await confirmSubmission(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes[0].action).toBe("retry");
  await expect(page.getByText("暂无此状态的支付异常")).toBeVisible();
  await page.getByLabel("异常处理状态").selectOption("done");
  await expect(
    page.getByRole("button", { name: "详情", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "重试处理", exact: true }),
  ).toHaveCount(0);
});

test("failed exception action preserves the review note and leaves the dialog usable", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/admin/virtual-payments/events/*/review", (route) =>
    route.fulfill({ status: 503, json: { error: "服务暂不可用，请稍后重试" } }),
  );
  await page.getByRole("button", { name: "人工核对", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "人工核对" });
  await dialog.getByLabel("核对说明").fill("已核对，暂存这段说明");
  await dialog.getByRole("button", { name: "保存核对说明" }).click();
  await confirmSubmission(page);
  await expect(dialog.getByRole("alert")).toContainText("服务暂不可用");
  await expect(dialog.getByLabel("核对说明")).toHaveValue(
    "已核对，暂存这段说明",
  );
  await expect(
    dialog.getByRole("button", { name: "保存核对说明" }),
  ).toBeEnabled();
});
