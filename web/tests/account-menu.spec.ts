import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("account menu shows account facts, recent sign-ins and opens own logs", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: /账号菜单/ }).click();
  const menu = page.getByRole("menu", { name: "账号" });
  await expect(menu).toContainText("可见菜单");
  await expect(menu).toContainText("会话有效至");
  const logins = menu.getByRole("region", { name: "最近登录" });
  await expect(logins.locator("li").first()).toBeVisible();
  await menu.getByRole("menuitem", { name: "我的操作日志" }).click();
  await expect(page.getByRole("tab", { name: "业务日志" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator('input[name="actor"]')).toHaveValue(
    process.env.ADMIN_USER || "admin",
  );
});
