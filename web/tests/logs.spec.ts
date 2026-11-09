import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("日志管理 shows who did what, with details and points history", async ({
  page,
  request,
}) => {
  await login(page);
  // A user and an admin action to look for.
  const demo = await (
    await request.post("/api/auth/login", {
      data: { demoId: "logs-spec-device-" + Date.now() },
    })
  ).json();
  const note = "日志验收补偿" + Date.now();
  const adjust = await page.request.post(
    `/api/admin/users/${demo.userId}/wallet`,
    {
      headers: { "Idempotency-Key": crypto.randomUUID() },
      data: { units: 1234, note },
    },
  );
  expect(adjust.ok()).toBeTruthy();

  await page.getByRole("button", { name: "日志管理", exact: true }).click();
  const row = page.locator("tbody tr").filter({ hasText: note });
  // Logs are written in batches every 0.5 s; refresh until it arrives.
  await expect(async () => {
    await page.getByRole("button", { name: "刷新", exact: true }).click();
    await expect(row).toContainText("调整用户积分", { timeout: 1000 });
  }).toPass({ timeout: 10000 });
  await expect(row).toContainText("增加 12.34 积分");
  await expect(row).toContainText("管理员");

  // Filtering by the target keeps only that user's entries.
  await page.getByLabel("操作对象").fill(demo.userId);
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);

  await row.getByRole("button", { name: "详情", exact: true }).click();
  const detail = page.getByRole("dialog", { name: "调整用户积分" });
  await expect(detail.getByRole("region", { name: "请求参数" })).toContainText(
    '"units": 1234',
  );
  await expect(detail).toContainText("HTTP 200");
  await detail.getByRole("button", { name: "关闭", exact: true }).click();

  await page.getByRole("tab", { name: "积分变动", exact: true }).click();
  const ledger = page.locator("tbody tr").filter({ hasText: note });
  await expect(ledger).toContainText("管理员调整");
  await expect(ledger).toContainText("+12.34");

  // Sign-ins, including the admin login above, are in their own tab.
  await page.getByRole("tab", { name: "登录日志", exact: true }).click();
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await expect(page.locator("tbody")).toContainText("登录");
});

test("接口日志 filters: writes-only lives in the method list; reset clears", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "日志管理", exact: true }).click();
  await page.getByRole("tab", { name: "接口日志" }).click();
  const asked = page.waitForRequest(
    (r) =>
      r.url().includes("/api/admin/audit?") && r.url().includes("writes=1"),
  );
  await page.getByLabel("请求方法").selectOption("writes");
  await page.getByRole("button", { name: "查询" }).click();
  expect(new URL((await asked).url()).searchParams.get("method")).toBeNull();
  const cleared = page.waitForRequest(
    (r) => r.url().includes("/api/admin/audit?") && !r.url().includes("writes"),
  );
  await page.getByRole("button", { name: "重置" }).click();
  await cleared;
  await expect(page.getByLabel("请求方法")).toHaveValue("");
});
