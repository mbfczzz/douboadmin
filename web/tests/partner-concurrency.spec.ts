import { test, expect } from "@playwright/test";
import { confirmSubmission, login } from "./helpers";
test.skip(
  process.env.PARTNER_ACCEPTANCE !== "true",
  "Requires isolated partner acceptance database and API",
);

test("background refresh cannot silently replace an open provider edit version", async ({
  page,
}) => {
  test.setTimeout(45000);
  await login(page);
  const response = await page.request.post("/api/admin/partners", {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: { parentId: "root", name: "并发编辑验收", role: "branch" },
  });
  expect(response.status()).toBe(200);
  const row = await response.json();
  await page.getByRole("button", { name: "服务商管理", exact: true }).click();
  await page
    .locator(".provider-tree-row")
    .filter({ hasText: "并发编辑验收" })
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "编辑服务商", exact: true });
  await dialog.getByLabel("服务商名称", { exact: true }).fill("我的未保存草稿");
  const polled = page.waitForResponse(
    async (r) =>
      new URL(r.url()).pathname === "/api/admin/partners/tree" &&
      (await r.json()).some(
        (p: { id: string; version: number }) =>
          p.id === row.id && p.version > row.version,
      ),
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
