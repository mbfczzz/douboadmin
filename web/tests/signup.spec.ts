import { test, expect } from "@playwright/test";
import { confirmSubmission, login } from "./helpers";
import { miniUser } from "./partner-helpers";

test("signup switch decides whether registered users may skip the provider code", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "小程序用户", exact: true }).click();
  const toggle = page.getByRole("switch", { name: "开放普通用户注册" });
  await expect(toggle).toBeVisible();
  const initially = (await toggle.getAttribute("aria-checked")) === "true";
  const flip = async (open: boolean) => {
    await toggle.click();
    await confirmSubmission(page);
    await expect(toggle).toHaveAttribute("aria-checked", String(open));
  };
  if (initially) await flip(false);
  const user = await miniUser(page.request);
  const access = await page.request.get("/api/access", {
    headers: user.headers,
  });
  expect(await access.json()).toMatchObject({
    profileRequired: false,
    openSignup: false,
  });
  const skip = await page.request.post("/api/access/direct", {
    headers: user.headers,
    data: {},
  });
  expect(skip.status()).toBe(403);
  await flip(true);
  const allowed = await page.request.post("/api/access/direct", {
    headers: user.headers,
    data: {},
  });
  expect(allowed.status()).toBe(200);
  await page.getByRole("button", { name: "刷新", exact: true }).first().click();
  const row = page.locator("tbody tr").filter({ hasText: user.userId });
  await expect(row).toContainText("已验证");
  await expect(row).toContainText("直接开通");
  if (!initially) await flip(false);
});
