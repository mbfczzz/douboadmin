import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers";

async function settings(page: Page) {
  await login(page);
  let record = {
    id: "platform",
    version: 1,
    createdAt: "",
    data: {
      pointsPerYuan: 100,
      minRechargeFen: 100,
      maxRechargeFen: 100000,
      alarmFailures: 5,
      alarmQueueMinutes: 10,
      hotKeywords: ["原始词"],
      supportText: "原始说明",
      billingEnabled: false,
      rechargeEnabled: false,
      reviewRequired: true,
    },
  };
  await page.route("**/api/admin/platform", async (route) => {
    if (route.request().method() === "PUT") {
      record = {
        ...record,
        version: record.version + 1,
        data: route.request().postDataJSON().data,
      };
    }
    await route.fulfill({ json: { record, capabilities: {} } });
  });
  await page.getByRole("button", { name: "系统设置", exact: true }).click();
  await expect(page.getByLabel("帮助与联系说明")).toHaveValue("原始说明");
  return () => record;
}

test("removed mix administration has no navigation, settings, or model lookup", async ({
  page,
}) => {
  const modelRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/admin/models"))
      modelRequests.push(request.url());
  });
  await settings(page);
  await expect(
    page.getByRole("button", { name: "背景音乐", exact: true }),
  ).toHaveCount(0);
  for (const label of ["单次混剪积分", "AI 改写模型", "AI 配音模型"])
    await expect(page.getByLabel(label, { exact: true })).toHaveCount(0);
  await expect(page.getByText("语音识别：", { exact: false })).toHaveCount(0);
  expect(modelRequests).toEqual([]);
  await page.goto("/#music");
  await expect(
    page.getByRole("heading", { name: "工作概览", exact: true }),
  ).toBeVisible();
});

test("keyword newlines survive typing and are normalized only on save", async ({
  page,
}) => {
  const record = await settings(page);
  const words = page.getByLabel("推荐搜索词（每行一条）");
  await words.fill("咖啡");
  await words.press("End");
  await words.press("Enter");
  await expect(words).toHaveValue("咖啡\n");
  await words.pressSequentially("travel");
  await words.press("Enter");
  await words.pressSequentially("  forest  ");
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("平台设置已保存");
  expect(record().data.hotKeywords).toEqual(["咖啡", "travel", "forest"]);
  await expect(words).toHaveValue("咖啡\ntravel\nforest");
  await expect(page.locator("form[data-unsaved]")).toHaveCount(0);
});

test("settings cancel navigation, reload and refresh without losing the draft", async ({
  page,
}) => {
  await settings(page);
  const field = page.getByLabel("帮助与联系说明");
  await field.fill("保留本次修改");
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "用户管理", exact: true }).click();
  await expect(page).toHaveURL(/#settings$/);
  await expect(field).toHaveValue("保留本次修改");
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(field).toHaveValue("保留本次修改");
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(field).toHaveValue("保留本次修改");
  let type = "";
  page.once("dialog", async (d) => {
    type = d.type();
    await d.dismiss();
  });
  await page.evaluate(() => location.reload());
  await expect.poll(() => type).toBe("beforeunload");
  await expect(field).toHaveValue("保留本次修改");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(field).toHaveValue("原始说明");
  await expect(page.locator("form[data-unsaved]")).toHaveCount(0);
});

test("failed payment filters hide old results and retry uses the latest query", async ({
  page,
}) => {
  await login(page);
  let fail = true;
  await page.route("**/api/admin/payments?*", (route) => {
    const query = new URL(route.request().url()).searchParams.get("q");
    if (query && fail)
      return route.fulfill({ status: 503, json: { error: "查询暂时失败" } });
    return route.fulfill({
      json: {
        page: 1,
        size: 20,
        total: 1,
        items: [
          {
            transactionId: query || "previous-query",
            orderId: "test-order",
            userId: "test-user",
            channel: "wechat_jsapi",
            amountFen: 100,
            pointsUnits: 10000,
            status: "paid",
            paidAt: "2026-11-01T01:00:00Z",
            confirmedAt: "2026-11-01T01:00:00Z",
          },
        ],
      },
    });
  });
  await page.getByRole("button", { name: "支付管理", exact: true }).click();
  await expect(page.getByText("previous-query", { exact: true })).toBeVisible();
  await page.getByLabel("搜索支付记录").fill("latest-query");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText("previous-query", { exact: true })).toHaveCount(
    0,
  );
  fail = false;
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.getByText("latest-query", { exact: true })).toBeVisible();
});

test("settings stay locked until the pending save finishes", async ({
  page,
}) => {
  await settings(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let saves = 0,
    prompts = 0;
  await page.route("**/api/admin/platform", async (route) => {
    if (route.request().method() === "PUT") {
      saves++;
      await pending;
    }
    await route.fallback();
  });
  page.on("dialog", async (d) => {
    prompts++;
    await d.dismiss();
  });
  await page.getByLabel("帮助与联系说明").fill("待保存的设置");
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect.poll(() => saves).toBe(1);
  await expect(page.getByLabel("帮助与联系说明")).toBeDisabled();
  await page.getByRole("button", { name: "用户管理", exact: true }).click();
  await expect(page).toHaveURL(/#settings$/);
  expect(prompts).toBe(0);
  release();
  await expect(page.getByRole("status")).toContainText("平台设置已保存");
  await expect(page.getByLabel("帮助与联系说明")).toBeEnabled();
  expect(saves).toBe(1);
});
