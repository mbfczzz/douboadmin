import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("retired business card and mix configuration have no controls or write requests", async ({
  page,
}) => {
  await login(page);
  const writes: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "PUT" &&
      request.url().endsWith("/api/admin/platform")
    )
      writes.push(request.url());
  });
  await page.getByRole("button", { name: "系统设置", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "服务接入配置" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "业务设置" })).toHaveCount(0);
  for (const label of [
    "每 1 元兑换积分",
    "最低充值金额（元）",
    "最高充值金额（元）",
    "启用微信充值",
    "启用生成积分扣减",
    "公开分享前需要人工审核",
    "推荐搜索词（每行一条）",
    "帮助与联系说明",
    "每小时失败告警阈值",
    "排队告警阈值（分钟）",
    "单次混剪积分",
    "AI 改写模型",
    "AI 配音模型",
  ])
    await expect(page.getByLabel(label, { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "保存设置", exact: true }),
  ).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("failed payment filters hide old results and retry uses the latest query", async ({
  page,
}) => {
  await login(page);
  let fail = true;
  await page.route("**/api/admin/payments?*", (route) => {
    const query = new URL(route.request().url()).searchParams.get("q");
    if (query && fail)
      return route.fulfill({ status: 503, json: { error: "查询暂时失败" } });
    return route.fulfill({
      json: {
        page: 1,
        size: 20,
        total: 1,
        items: [
          {
            transactionId: query || "previous-query",
            orderId: "test-order",
            userId: "test-user",
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
  });
  await page.getByRole("button", { name: "支付管理", exact: true }).click();
  await expect(page.getByText("previous-query", { exact: true })).toBeVisible();
  await page.getByLabel("搜索支付记录").fill("latest-query");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText("previous-query", { exact: true })).toHaveCount(
    0,
  );
  fail = false;
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.getByText("latest-query", { exact: true })).toBeVisible();
});
