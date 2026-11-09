import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import { issueCode, miniUser } from "./partner-helpers";
test.skip(
  process.env.PARTNER_ACCEPTANCE !== "true",
  "Requires isolated partner acceptance database and API",
);
test("code trace shows issuer, activation user and retained history after unbinding", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "小程序用户", exact: true }).click();
  await page.getByRole("button", { name: "服务商管理", exact: true }).click();
  const code = await issueCode(page, "来源记录验收");
  const user = await miniUser(page.request),
    headers = user.headers;
  const activated = await page.request.post("/api/access/redeem", {
    headers,
    data: { code, method: "qr" },
  });
  expect(activated.status()).toBe(200);
  const profile = await (await page.request.get("/api/me", { headers })).json();
  expect(
    (
      await page.request.put("/api/me", {
        headers,
        data: {
          version: profile.profile.version,
          nickname: "改名后用户",
          name: "小王",
          bio: "",
        },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole("button", { name: "刷新", exact: true }).nth(1).click();
  const row = page.locator("tbody tr").filter({ hasText: "来源记录验收" });
  await expect(row).toContainText("admin");
  await expect(row).toContainText(user.userId);
  await expect(row).toContainText("扫码");
  await row.getByRole("button", { name: "来源记录", exact: true }).click();
  let detail = page.getByRole("dialog", {
    name: "二维码生成与激活记录",
    exact: true,
  });
  await expect(detail).toContainText("改名后用户 / 小王");
  await expect(detail).toContainText("微信用户");
  await expect(detail).toContainText(user.userId);
  await page.screenshot({
    path: "../.runtime/activation-trace-isolated-test.png",
    fullPage: true,
  });
  await detail.getByRole("button", { name: "关闭", exact: true }).click();
  const bindings = await (
    await page.request.get("/api/admin/memberships?q=" + user.userId)
  ).json();
  expect(
    (
      await page.request.put("/api/admin/memberships/" + user.userId, {
        data: {
          version: bindings.items[0].version,
          status: "unbound",
          reason: "来源记录解绑验收",
        },
      })
    ).status(),
  ).toBe(200);
  await row.getByRole("button", { name: "来源记录", exact: true }).click();
  detail = page.getByRole("dialog", {
    name: "二维码生成与激活记录",
    exact: true,
  });
  await expect(detail).toContainText("已解绑");
  await expect(detail).toContainText(user.userId);
  await expect(detail).toContainText("admin");
});
