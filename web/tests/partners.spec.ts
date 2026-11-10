import { test, expect, type Page } from "@playwright/test";
import { answerAsk, confirmSubmission, login } from "./helpers";
import { createProvider, providerCode, miniUser } from "./partner-helpers";

test.skip(
  process.env.PARTNER_ACCEPTANCE !== "true",
  "Requires isolated partner acceptance database and API",
);

// The registration row of one mini-program user on the 小程序用户 page.
async function registration(page: Page, userId: string) {
  await page.getByRole("button", { name: "小程序用户", exact: true }).click();
  const section = page.getByRole("region", { name: "扫码登记" });
  await section.getByPlaceholder("搜索姓名、手机号或用户编号").fill(userId);
  const row = section.locator("tbody tr").filter({ hasText: userId });
  await expect(row).toHaveCount(1);
  return row;
}

test("scans only register; 总部 opens or rejects; members can be suspended", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.getByRole("button", { name: "服务商管理", exact: true }).click();
  const stamp = Date.now();
  const branch = await createProvider(page, `验收分公司${stamp}`);
  expect(branch.data.role).toBe("branch");
  const s1 = await createProvider(
    page,
    `验收 S1 ${stamp}`,
    `验收分公司${stamp}`,
    "S1 服务商",
  );
  expect(s1.data.role).toBe("s1");

  // A member scan registers and waits for 总部.
  const member = await miniUser(page.request),
    headers = member.headers;
  const joined = await page.request.post("/api/access/join", {
    headers,
    data: { code: await providerCode(page.request, s1.id), method: "scan" },
  });
  expect(joined.status()).toBe(200);
  expect((await joined.json()).active).toBe(false);
  expect((await page.request.get("/api/templates", { headers })).status()).toBe(
    403,
  );
  // An S2 invite scan registers a pending provider below the 分公司.
  const scout = await miniUser(page.request);
  const invited = await page.request.post("/api/access/join", {
    headers: scout.headers,
    data: {
      code: await providerCode(page.request, branch.id, "s2"),
      method: "scan",
    },
  });
  expect(invited.status()).toBe(200);

  let row = await registration(page, member.userId);
  await expect(row).toContainText("会员开通码");
  await row.getByRole("button", { name: "开通", exact: true }).click();
  await answerAsk(page, true);
  expect((await page.request.get("/api/templates", { headers })).status()).toBe(
    200,
  );
  row = await registration(page, scout.userId);
  await expect(row).toContainText("S2 推荐官");
  await row.getByRole("button", { name: "拒绝", exact: true }).click();
  const reject = page.getByRole("dialog", { name: "拒绝登记" });
  await reject.getByLabel("拒绝原因").fill("验收拒绝");
  await reject.getByRole("button", { name: "拒绝", exact: true }).click();
  await expect(reject).toHaveCount(0);

  // The opened member shows in the S1's 分享码 dialog and can be suspended.
  await page.getByRole("button", { name: "服务商管理", exact: true }).click();
  await page
    .locator(".provider-tree-row")
    .filter({ hasText: `验收 S1 ${stamp}` })
    .getByRole("button", { name: "分享码", exact: true })
    .click();
  const members = page.getByRole("region", { name: "已加入的会员" });
  const memberRow = members.locator("tbody tr").filter({
    hasText: member.userId,
  });
  await memberRow.getByRole("button", { name: "停用", exact: true }).click();
  const stop = page.getByRole("dialog", { name: "停用用户授权" });
  await stop.getByLabel("原因").fill("验收停用授权");
  await stop.getByRole("button", { name: "停用授权" }).click();
  await confirmSubmission(page);
  await expect(stop).toHaveCount(0);
  expect((await page.request.get("/api/jobs", { headers })).status()).toBe(403);
  expect(errors).toEqual([]);
});
