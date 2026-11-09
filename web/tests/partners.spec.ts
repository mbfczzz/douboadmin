import { test, expect } from "@playwright/test";
import { confirmSubmission, login } from "./helpers";
import {
  createProvider,
  selectProvider,
  issueCode,
  miniUser,
} from "./partner-helpers";

test.skip(
  process.env.PARTNER_ACCEPTANCE !== "true",
  "Requires isolated partner acceptance database and API",
);
test("fixed user quotas, QR activation, suspension, unbinding and configurable margins", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.getByRole("button", { name: "小程序用户", exact: true }).click();
  await page.getByRole("button", { name: "服务商管理", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "服务商列表", exact: true }),
  ).toBeVisible();
  const s1 = await createProvider(page, "验收 S1");
  await selectProvider(page, "验收 S1");
  const s2 = await createProvider(page, "验收 S2");
  let view = await (
    await page.request.get("/api/admin/partners/" + s2.id)
  ).json();
  expect(view.quota.users.granted).toBe(10);
  const additional = await page.request.post("/api/admin/partners", {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: { parentId: s1.id, name: "额度不足的服务商", users: 1 },
  });
  expect(additional.status()).toBe(409);
  view = await (await page.request.get("/api/admin/partners/" + s1.id)).json();
  expect(view.quota.users.allocated).toBe(10);
  await selectProvider(page, "验收 S2");
  const code = await issueCode(page);
  const user = await miniUser(page.request),
    headers = user.headers;
  expect((await page.request.get("/api/templates", { headers })).status()).toBe(
    403,
  );
  const activation = await page.request.post("/api/access/redeem", {
    headers,
    data: { code: "DOUBO-ACTIVATE:" + code },
  });
  expect(activation.status()).toBe(200);
  expect((await activation.json()).active).toBe(true);
  expect((await page.request.get("/api/templates", { headers })).status()).toBe(
    200,
  );
  const other = await miniUser(page.request);
  expect(
    (
      await page.request.post("/api/access/redeem", {
        headers: { Authorization: "Bearer " + other.token },
        data: { code },
      })
    ).status(),
  ).toBe(400);
  await page.getByRole("button", { name: "刷新", exact: true }).last().click();
  const row = page
    .locator("tbody tr")
    .filter({
      has: page.getByRole("button", { name: "管理授权", exact: true }),
    })
    .filter({ hasText: user.userId });
  await row.getByRole("button", { name: "管理授权", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "管理用户授权", exact: true });
  await dialog.getByLabel("原因", { exact: true }).fill("测试停用授权");
  await dialog
    .getByRole("button", { name: "保存授权状态", exact: true })
    .click();
  await confirmSubmission(page);
  await expect(dialog).toHaveCount(0);
  view = await (await page.request.get("/api/admin/partners/" + s2.id)).json();
  expect(view.quota.users.used).toBe(1);
  expect((await page.request.get("/api/jobs", { headers })).status()).toBe(403);
  const replay = await page.request.post("/api/access/redeem", {
    headers,
    data: { code },
  });
  expect((await replay.json()).active).toBe(false);
  await row.getByRole("button", { name: "管理授权", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "管理用户授权", exact: true });
  await dialog
    .getByRole("combobox", { name: "操作", exact: true })
    .selectOption("unbound");
  await dialog.getByLabel("原因", { exact: true }).fill("测试解绑释放名额");
  await dialog
    .getByRole("button", { name: "保存授权状态", exact: true })
    .click();
  await confirmSubmission(page);
  await expect(dialog).toHaveCount(0);
  view = await (await page.request.get("/api/admin/partners/" + s2.id)).json();
  expect(view.quota.users.used).toBe(0);
  expect(view.quota.users.granted - view.quota.users.reserved).toBe(10);
  await selectProvider(page, "总账号");
  await page.getByRole("tab", { name: "算力分佣", exact: true }).click();
  await page
    .getByLabel("每 100 元基准算力成本（元）", { exact: true })
    .fill("80");
  await page.getByLabel("总账号保留毛利（%）", { exact: true }).fill("50");
  await page.getByLabel("已确认成本与价格，启用按充值分佣").check();
  await page.getByRole("button", { name: "保存分佣规则", exact: true }).click();
  await confirmSubmission(page);
  await expect(
    page.getByText("价格规则已保存，历史订单快照不变", { exact: true }),
  ).toBeVisible();
  await selectProvider(page, "验收 S2");
  view = await (await page.request.get("/api/admin/partners/" + s2.id)).json();
  expect(view.price.incomingPer100Fen).toBe(9500);
  expect(
    view.price.shares.map((s: { amountFen: number }) => s.amountFen),
  ).toEqual([1000, 500, 500]);
  expect(view.commission.balanceFen).toBe(0);
  await page.screenshot({
    path: "../.runtime/partners-pricing-isolated-test.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: "下级服务商", exact: true }).click();
  await page
    .getByRole("button", { name: "编辑当前服务商", exact: true })
    .click();
  const edit = page.getByRole("dialog", { name: "编辑服务商", exact: true });
  await edit
    .getByLabel("子账号售价（每 100 元基准算力）", { exact: true })
    .fill("94");
  await edit.getByRole("button", { name: "保存服务商", exact: true }).click();
  await confirmSubmission(page);
  await expect(
    page.getByText("服务商售价低于进价，请先调整价格链", { exact: true }),
  ).toBeVisible();
  await edit.getByRole("button", { name: "关闭", exact: true }).click();
  expect(errors).toEqual([]);
});
