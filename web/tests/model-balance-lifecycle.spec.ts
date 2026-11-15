import { expect, test } from "@playwright/test";
import { mockLogin } from "./mock-login";
import { modelPage } from "./model-tab-fixture";

test("slow balance leaves models usable and shows no old amount while refreshing", async ({
  page,
}) => {
  await mockLogin(page);
  await page.route("**/api/admin/models?*", (route) =>
    route.fulfill({ json: modelPage("image") }),
  );
  let release!: () => void;
  let pending: Promise<void>;
  let calls = 0;
  const wait = () => {
    pending = new Promise<void>((resolve) => {
      release = resolve;
    });
  };
  wait();
  await page.route("**/api/admin/models/balance", async (route) => {
    calls++;
    await pending;
    await route.fulfill({
      json: {
        balance: calls === 1 ? 100.123456 : 0.000001,
        unit: "points",
        checkedAt: new Date().toISOString(),
      },
    });
  });
  await page.goto("/#models");
  const balance = page.getByLabel("中转站账户余额", { exact: true });
  const refresh = balance.getByRole("button", {
    name: "刷新中转余额",
    exact: true,
  });
  await expect(balance).toContainText("查询中…");
  await expect(refresh).toBeDisabled();
  await page.getByRole("tab", { name: "图片模型", exact: true }).click();
  await expect(page.getByText("图片模型条目", { exact: true })).toBeVisible();
  expect(calls).toBe(1);
  release();
  await expect(balance).toContainText("100.123456 积分");
  wait();
  await refresh.click();
  await expect(balance).toContainText("查询中…");
  await expect(balance).not.toContainText("100.123456");
  await expect(refresh).toBeDisabled();
  release();
  await expect(balance).toContainText("0.000001 积分");
  expect(calls).toBe(2);
});

test("unconfigured and malformed responses never become a zero balance", async ({
  page,
}) => {
  await mockLogin(page);
  await page.route("**/api/admin/models?*", (route) =>
    route.fulfill({ json: modelPage("image") }),
  );
  let calls = 0;
  await page.route("**/api/admin/models/balance", (route) => {
    calls++;
    return route.fulfill(
      calls === 1
        ? { status: 503, json: { error: "中转站尚未配置，请先配置服务接入" } }
        : calls === 2
          ? { json: { balance: "0", unit: "points" } }
          : {
              json: {
                balance: 0,
                unit: "points",
                checkedAt: new Date().toISOString(),
              },
            },
    );
  });
  await page.goto("/#models");
  const balance = page.getByLabel("中转站账户余额", { exact: true });
  const refresh = balance.getByRole("button", {
    name: "刷新中转余额",
    exact: true,
  });
  await expect(balance).toContainText("查询失败");
  await expect(balance).toHaveAttribute("title", /尚未配置/);
  await expect(balance).not.toContainText("0 积分");
  await refresh.click();
  await expect(balance).toHaveAttribute("title", /响应格式无效/);
  await expect(balance).not.toContainText("0 积分");
  await refresh.click();
  await expect(balance).toContainText("0 积分");
});
