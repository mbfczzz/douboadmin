import { test, expect } from "@playwright/test";
import { confirmSubmission, login } from "./helpers";
import { selectProvider } from "./partner-helpers";
test.skip(
  process.env.PARTNER_ACCEPTANCE !== "true",
  "Requires isolated partner acceptance database and API",
);

async function openBusiness(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "小程序用户", exact: true }).click();
  await page.getByRole("button", { name: "服务商管理", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "服务商列表", exact: true }),
  ).toBeVisible();
}
test("an accepted code issue with a lost response keeps its key across browser reload", async ({
  page,
}) => {
  await login(page);
  await openBusiness(page);
  const before = await (
    await page.request.get("/api/admin/partners/root")
  ).json();
  let firstKey = "",
    issued = "";
  await page.route("**/api/admin/activation-codes", async (route) => {
    if (route.request().method() !== "POST" || issued) {
      await route.continue();
      return;
    }
    firstKey = route.request().headers()["idempotency-key"];
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    issued = (await response.json()).id;
    await route.abort("failed");
  });
  async function submit() {
    await page.getByRole("tab", { name: "授权激活", exact: true }).click();
    await page.getByRole("button", { name: "生成授权码", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "生成授权码",
      exact: true,
    });
    await dialog.getByLabel("备注", { exact: true }).fill("网络重试验收");
    await dialog
      .getByRole("button", { name: "生成并预留名额", exact: true })
      .click();
  }
  await submit();
  await expect(
    page.getByText("连接失败，请检查网络后重试", { exact: true }),
  ).toBeVisible();
  expect(issued).not.toBe("");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "工作概览", exact: true }),
  ).toBeVisible();
  await openBusiness(page);
  const second = page.waitForRequest(
    (r) =>
      new URL(r.url()).pathname === "/api/admin/activation-codes" &&
      r.method() === "POST",
  );
  await submit();
  expect((await second).headers()["idempotency-key"]).toBe(firstKey);
  await expect(
    page.getByRole("dialog", { name: "授权二维码 / 激活码", exact: true }),
  ).toBeVisible();
  const after = await (
    await page.request.get("/api/admin/partners/root")
  ).json();
  expect(after.quota.users.reserved - before.quota.users.reserved).toBe(1);
});

test("background refresh cannot silently replace an open provider edit version", async ({
  page,
}) => {
  test.setTimeout(45000);
  await login(page);
  const response = await page.request.post("/api/admin/partners", {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: { parentId: "root", name: "并发编辑验收", users: 10 },
  });
  expect(response.status()).toBe(200);
  const row = await response.json();
  await openBusiness(page);
  await selectProvider(page, "并发编辑验收");
  await page
    .getByRole("button", { name: "编辑当前服务商", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "编辑服务商", exact: true });
  await dialog.getByLabel("服务商名称", { exact: true }).fill("我的未保存草稿");
  const polled = page.waitForResponse(
    async (r) =>
      new URL(r.url()).pathname === "/api/admin/partners/" + row.id &&
      r.request().method() === "GET" &&
      (await r.json()).record.version > row.version,
    { timeout: 20000 },
  );
  const update = await page.request.put("/api/admin/partners/" + row.id, {
    data: {
      version: row.version,
      data: { ...row.data, name: "其他操作员更新" },
    },
  });
  expect(update.status()).toBe(200);
  await polled;
  await dialog.getByRole("button", { name: "保存服务商", exact: true }).click();
  await confirmSubmission(page);
  await expect(
    page.getByText("数据已发生变化，请刷新后重试", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByLabel("服务商名称", { exact: true })).toHaveValue(
    "我的未保存草稿",
  );
});
