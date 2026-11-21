import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// 日志管理 → 功能使用: taps counted per function, most clicked shown.
test("功能使用 lists clicks and uses per function", async ({ page }) => {
  await login(page);
  for (let i = 0; i < 3; i++)
    await page.request.post("/api/features/tryon/click", {
      headers: { "Content-Type": "application/json" },
      data: {},
    });
  await page.getByRole("button", { name: "日志管理", exact: true }).click();
  await page.getByRole("tab", { name: "功能使用" }).click();
  await page.getByRole("tab", { name: "今天" }).click();
  const row = page.getByRole("row", { name: /AI试衣/ });
  await expect(row).toBeVisible();
  await expect(row.getByTitle(/AI试衣 点击 \d+ 次/)).toBeVisible();
  await expect(page.getByText("点击最多")).toBeVisible();
  await expect(page.getByText("使用最多")).toBeVisible();
});
