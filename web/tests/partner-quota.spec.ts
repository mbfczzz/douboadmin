import { test, expect } from "@playwright/test";
import { confirmSubmission, login, answerAsk } from "./helpers";
import { selectProvider, issueCode, miniUser } from "./partner-helpers";
test.skip(
  process.env.PARTNER_ACCEPTANCE !== "true",
  "Requires isolated partner acceptance database and API",
);
test("quota requests approve against the parent pool and unused codes can be revoked", async ({
  page,
}) => {
  await login(page);
  const response = await page.request.post("/api/admin/partners", {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: { parentId: "root", name: "申请验收服务商", users: 1 },
  });
  expect(response.status()).toBe(200);
  const partner = await response.json();
  await page.getByRole("button", { name: "小程序用户", exact: true }).click();
  await page.getByRole("button", { name: "服务商管理", exact: true }).click();
  await selectProvider(page, "申请验收服务商");
  await page.getByRole("tab", { name: "名额划拨", exact: true }).click();
  await page.getByRole("button", { name: "向上级申请", exact: true }).click();
  const form = page.getByRole("dialog", {
    name: "向上级申请名额",
    exact: true,
  });
  await form.getByLabel("用户额度", { exact: true }).fill("2");
  await form.getByLabel("原因", { exact: true }).fill("测试申请两个用户额度");
  await form.getByRole("button", { name: "提交申请", exact: true }).click();
  await expect(form).toHaveCount(0);
  const row = page
    .locator("tbody tr")
    .filter({ hasText: partner.id })
    .filter({ has: page.getByRole("button", { name: "审批", exact: true }) });
  await row.getByRole("button", { name: "审批", exact: true }).click();
  const decision = page.getByRole("dialog", {
    name: "名额申请审批",
    exact: true,
  });
  await decision
    .getByLabel("审批说明", { exact: true })
    .fill("同意从总账号划拨");
  await decision.getByRole("button", { name: "保存审批", exact: true }).click();
  await confirmSubmission(page);
  await expect(decision).toHaveCount(0);
  let view = await (
    await page.request.get("/api/admin/partners/" + partner.id)
  ).json();
  expect(view.quota.users.granted).toBe(3);
  const code = await issueCode(page);
  view = await (
    await page.request.get("/api/admin/partners/" + partner.id)
  ).json();
  expect(view.quota.users.reserved).toBe(1);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await answerAsk(page, true);
  await expect(page.getByText("已撤销", { exact: true })).toBeVisible();
  view = await (
    await page.request.get("/api/admin/partners/" + partner.id)
  ).json();
  expect(view.quota.users.reserved).toBe(0);
  expect(view.quota.users.used).toBe(0);
  const user = await miniUser(page.request);
  const redeemed = await page.request.post("/api/access/redeem", {
    headers: { Authorization: "Bearer " + user.token },
    data: { code },
  });
  expect(redeemed.status()).toBe(400);
});
