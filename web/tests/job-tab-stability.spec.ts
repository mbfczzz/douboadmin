import { expect, test, type Page, type Route } from "@playwright/test";
import { mockLogin } from "./mock-login";

function result(prompt: string, status = "running") {
  return {
    page: 1,
    size: 20,
    total: prompt ? 1 : 0,
    items: prompt
      ? [
          {
            id: "stable-job",
            userId: "test-user",
            status,
            progress: 30,
            input: { kind: "image", prompt },
            createdAt: "2026-11-10T00:00:00Z",
          },
        ]
      : [],
  };
}
async function open(page: Page, handler: (route: Route) => Promise<void>) {
  await mockLogin(page);
  await page.route("**/api/admin/jobs?*", handler);
  await page.goto("/#jobs");
}
async function controls(page: Page) {
  return page.locator(".jobs-page .toolbar").evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
}
function stable(
  actual: Awaited<ReturnType<typeof controls>>,
  before: Awaited<ReturnType<typeof controls>>,
) {
  for (const key of ["x", "y", "width", "height"] as const)
    expect(Math.abs(actual[key] - before[key]), key).toBeLessThanOrEqual(1);
}

for (const width of [1440, 390, 320]) {
  test(`job status switches keep tabs and content space stable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrived = false;
    await open(page, async (route) => {
      const status = new URL(route.request().url()).searchParams.get("status");
      if (status === "running") {
        arrived = true;
        await pending;
      }
      await route.fulfill({
        json: result(status === "running" ? "" : "当前任务"),
      });
    });
    await expect(page.getByText("当前任务", { exact: true })).toBeVisible();
    const before = await controls(page);
    const region = page.getByRole("region", { name: "生成任务列表" });
    const height = (await region.boundingBox())!.height;
    await page.getByRole("button", { name: "生成中", exact: true }).click();
    await expect.poll(() => arrived).toBe(true);
    try {
      await expect(region).toHaveAttribute("aria-busy", "true");
      await expect(page.getByText("当前任务", { exact: true })).toHaveCount(0);
      stable(await controls(page), before);
      expect((await region.boundingBox())!.height).toBeGreaterThanOrEqual(
        height - 1,
      );
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `../.runtime/job-tab-loading-${width}.png`,
        fullPage: true,
      });
    } finally {
      release();
    }
    await expect(
      page.getByText("暂无匹配的任务", { exact: true }),
    ).toBeVisible();
    stable(await controls(page), before);
    await page.getByRole("button", { name: "全部任务", exact: true }).click();
    await expect(page.getByText("当前任务", { exact: true })).toBeVisible();
    stable(await controls(page), before);
  });
}

test("periodic refresh keeps rows visible and stops after leaving the jobs page", async ({
  page,
}) => {
  await page.clock.install();
  let count = 0;
  let arrived = false;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await open(page, async (route) => {
    count++;
    if (count === 2) {
      arrived = true;
      await pending;
    }
    await route.fulfill({
      json: result(count === 1 ? "刷新前的任务" : "刷新后的任务"),
    });
  });
  await expect(page.getByText("刷新前的任务", { exact: true })).toBeVisible();
  const before = await controls(page);
  await page.clock.runFor(15010);
  await expect.poll(() => arrived).toBe(true);
  try {
    await expect(page.getByText("刷新前的任务", { exact: true })).toBeVisible();
    await expect(page.locator(".catalog-results-loading")).toHaveCount(0);
    stable(await controls(page), before);
  } finally {
    release();
  }
  await expect(page.getByText("刷新后的任务", { exact: true })).toBeVisible();
  await page.goto("/#overview");
  await expect(
    page.getByRole("heading", { name: "工作概览", exact: true }),
  ).toBeVisible();
  const requests = count;
  await page.clock.runFor(30010);
  expect(count).toBe(requests);
});

test("failed status query stays below the tabs and retries the selected status", async ({
  page,
}) => {
  let fail = true;
  await open(page, (route) => {
    const status = new URL(route.request().url()).searchParams.get("status");
    return route.fulfill(
      status === "failed" && fail
        ? { status: 503, json: { error: "失败任务读取暂不可用" } }
        : {
            json: result(
              status === "failed" ? "失败任务结果" : "当前任务",
              status || "running",
            ),
          },
    );
  });
  await expect(page.getByText("当前任务", { exact: true })).toBeVisible();
  const before = await controls(page);
  await page.getByRole("button", { name: "失败", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("读取暂不可用");
  await expect(page.getByText("当前任务", { exact: true })).toHaveCount(0);
  stable(await controls(page), before);
  fail = false;
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.getByText("失败任务结果", { exact: true })).toBeVisible();
  stable(await controls(page), before);
});
