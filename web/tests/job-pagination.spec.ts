import { test, expect } from "@playwright/test";
import { mockLogin } from "./mock-login";

test("generation paging and search are server queries", async ({ page }) => {
  await mockLogin(page);
  const calls: URL[] = [];
  await page.route("**/api/admin/models", (route) =>
    route.fulfill({
      json: [
        {
          id: "model-a",
          version: 1,
          data: { id: "model-a", name: "测试视频模型", kind: "video" },
        },
      ],
    }),
  );
  await page.route("**/api/admin/jobs?*", (route) => {
    const url = new URL(route.request().url());
    calls.push(url);
    const number = Number(url.searchParams.get("page"));
    return route.fulfill({
      json: {
        page: number,
        size: 20,
        total: 205,
        items: [
          {
            id: `job-page-${number}`,
            userId: "qa-user",
            userName: "测试用户",
            userPhone: "13900139000",
            status: "succeeded",
            progress: 100,
            costUnits: 1234,
            billingState: "charged",
            input: { kind: "image", prompt: `page ${number} prompt` },
            createdAt: "2026-11-10T00:00:00Z",
          },
          {
            id: `job-released-${number}`,
            userId: "qa-user",
            status: "failed",
            progress: 100,
            costUnits: 5600,
            billingState: "released",
            input: { kind: "video", prompt: "已退回任务" },
            createdAt: "2026-11-10T00:00:00Z",
          },
          {
            id: `job-pending-${number}`,
            userId: "qa-user",
            status: "running",
            progress: 50,
            costUnits: 2500,
            billingState: "reserved",
            input: { kind: "video", prompt: "待结算任务" },
            createdAt: "2026-11-10T00:00:00Z",
          },
        ],
      },
    });
  });
  await page.getByRole("button", { name: "生成任务", exact: true }).click();
  await expect(page.locator("tbody")).toContainText("page 1 prompt");
  await expect(page.getByRole("columnheader", { name: "用户名" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "手机号" })).toBeVisible();
  await expect(page.locator("tbody")).toContainText("测试用户");
  await expect(page.locator("tbody")).toContainText("13900139000");
  await expect(page.getByRole("columnheader", { name: "消耗积分" })).toBeVisible();
  await expect(page.locator("tbody")).toContainText("12.34");
  await expect(
    page.getByRole("row", { name: /已退回任务/ }).getByRole("cell").nth(3),
  ).toHaveText("0");
  await expect(
    page.getByRole("row", { name: /待结算任务/ }).getByRole("cell").nth(3),
  ).toHaveText("待结算");
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.locator("tbody")).toContainText("page 2 prompt");
  expect(calls.at(-1)?.searchParams.get("page")).toBe("2");
  await page.getByPlaceholder("搜索提示词或任务编号").fill("old model");
  await expect
    .poll(() => calls.at(-1)?.searchParams.get("q"))
    .toBe("old model");
  expect(calls.at(-1)?.searchParams.get("page")).toBe("1");
  await page.getByLabel("任务模型").selectOption("model-a");
  await expect
    .poll(() => calls.at(-1)?.searchParams.get("model"))
    .toBe("model-a");
  await page.getByLabel("任务时间").selectOption("7d");
  await expect
    .poll(() => calls.at(-1)?.searchParams.get("from"))
    .toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(calls.at(-1)?.searchParams.get("to")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await page.getByLabel("任务时间").selectOption("custom");
  await page.getByRole("textbox", { name: "任务开始日期" }).fill("2026-11-01");
  await page.getByRole("textbox", { name: "任务结束日期" }).fill("2026-11-22");
  await expect
    .poll(() => [
      calls.at(-1)?.searchParams.get("from"),
      calls.at(-1)?.searchParams.get("to"),
    ])
    .toEqual(["2026-11-01", "2026-11-22"]);
  // Typed key by key, past the end date: half-typed dates are never sent and
  // a reversed range is swapped, so the server never answers 400.
  const start = page.getByRole("textbox", { name: "任务开始日期" });
  await start.fill("");
  await start.pressSequentially("2026-11-30");
  await expect
    .poll(() => [
      calls.at(-1)?.searchParams.get("from"),
      calls.at(-1)?.searchParams.get("to"),
    ])
    .toEqual(["2026-11-22", "2026-11-30"]);
  for (const url of calls)
    for (const key of ["from", "to"])
      expect(url.searchParams.get(key) || "").toMatch(/^(\d{4}-\d{2}-\d{2})?$/);
});

test("works apply filters on the server before paginating", async ({
  page,
}) => {
  await mockLogin(page);
  const calls: URL[] = [];
  await page.route("**/api/admin/works?*", (route) => {
    const url = new URL(route.request().url());
    calls.push(url);
    return route.fulfill({
      json: {
        page: Number(url.searchParams.get("page")),
        size: 20,
        total: 500,
        items: [],
      },
    });
  });
  await page.getByRole("button", { name: "作品管理", exact: true }).click();
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect.poll(() => calls.at(-1)?.searchParams.get("page")).toBe("2");
  await page.getByLabel("作品状态", { exact: true }).selectOption("deleted");
  await expect
    .poll(() => calls.at(-1)?.searchParams.get("deleted"))
    .toBe("deleted");
  expect(calls.at(-1)?.searchParams.get("page")).toBe("1");
});
