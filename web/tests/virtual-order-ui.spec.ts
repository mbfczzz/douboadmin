import { expect, test } from "@playwright/test";
import { login } from "./helpers";
import { surfaceFixtures } from "./surface-fixtures";
import { readFileSync } from "node:fs";
import path from "node:path";

for (const platform of ["wechat", "ios"]) {
  test(`virtual order details show ${platform} refund policy`, async ({
    page,
  }) => {
    await login(page);
    await surfaceFixtures(page);
    await page.route("**/api/admin/orders", (route) =>
      route.fulfill({
        json: [
          {
            id: "virtual-ui-order",
            version: 1,
            createdAt: "2026-11-06T00:00:00Z",
            data: {
              userId: "qa-user",
              channel: "wechat_virtual",
              status: "paid",
              amountFen: 1000,
              pointsUnits: 100000,
              transactionId: "virtual-transaction",
              virtual: { productName: "1000积分", platform },
            },
          },
        ],
      }),
    );
    await page.getByRole("button", { name: "充值订单", exact: true }).click();
    await page
      .getByRole("button", { name: "详情", exact: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog", { name: "充值订单详情" });
    await expect(dialog).toContainText("微信虚拟支付");
    await expect(dialog).toContainText("1000积分");
    // Refund is a row action of its own; the detail stays read-only.
    await expect(dialog.getByRole("button", { name: /退款/ })).toHaveCount(0);
    const refund = page
      .locator("tbody tr")
      .first()
      .getByRole("button", { name: "退款", exact: true });
    if (platform === "ios") {
      await expect(dialog).toContainText("App Store");
      await expect(refund).toHaveCount(0);
    } else await expect(refund).toBeVisible();
  });
}

function styles(file: string, width: number): string {
  return readFileSync(path.resolve("../miniprogram", file), "utf8")
    .replace(/@import "([^"]+)";/g, (_, imported) =>
      styles(path.join(path.dirname(file), imported), width),
    )
    .replace(/^page\s*{/gm, "body {")
    .replace(/(?<![\w.-])view\b/g, "div")
    .replace(/(?<![\w.-])text\b(?=\s*[,>{:])/g, "span")
    .replace(/([\d.]+)rpx/g, (_, n) => `${(Number(n) * width) / 750}px`);
}
for (const width of [320, 390]) {
  test(`virtual products fit ${width}px without clipping price or points`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    const css = [
      "styles/theme.wxss",
      "styles/common.wxss",
      "pages/wallet/index.wxss",
    ]
      .map((file) => styles(file, width))
      .join("\n");
    await page.setContent(
      `<style>body{margin:0;font-family:sans-serif}${css}</style><div class="subpage"><div class="biz-card"><span class="biz-heading">购买积分</span><div class="virtual-products">${[1, 2, 3, 4].map((n) => `<button class="virtual-product ${n === 1 ? "selected" : ""}"><span>${n * 1000}积分</span><span class="product-price">¥${n * 10}.00</span><span class="biz-small">${n * 1000} 积分</span></button>`).join("")}</div><button class="biz-action">购买积分</button></div></div>`,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    for (const card of await page.locator(".virtual-product").all()) {
      expect(
        await card.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
    }
    await page.screenshot({
      path: `../.runtime/virtual-products-${width}.png`,
    });
  });
}
