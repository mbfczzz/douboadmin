import { expect, test, type Page, type Route } from "@playwright/test";
import { mockLogin } from "./mock-login";
import { confirmSubmission } from "./helpers";

function result(kind: string, total = 1, published = false, title?: string) {
  return {
    page: 1,
    size: 12,
    total,
    items: total
      ? [
          {
            id: kind + "-1",
            version: 1,
            createdAt: "2026-11-10T00:00:00Z",
            data: {
              title: title || (kind === "image" ? "图片模板" : "视频模板"),
              kind,
              category: "测试",
              published,
              cover: "",
              prompt: "测试提示词",
              description: "",
              model: "",
              requiredImages: 0,
              sort: 0,
              ratio: "1:1",
            },
          },
        ]
      : [],
  };
}
async function open(page: Page, handler: (route: Route) => Promise<void>) {
  await mockLogin(page);
  await page.route("**/api/admin/models", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/admin/templates/categories", (route) =>
    route.fulfill({ json: ["测试"] }),
  );
  await page.route("**/api/admin/templates?*", handler);
  await page.goto("/#templates");
}
async function controls(page: Page) {
  return page.locator(".catalog-toolbar").evaluate((el) => {
    const box = el.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
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
  test(`delayed image/video switching keeps controls stable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    let release!: () => void;
    let arrived = false;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: string[] = [];
    await open(page, async (route) => {
      const kind = new URL(route.request().url()).searchParams.get("kind")!;
      calls.push(kind);
      if (kind === "video") {
        arrived = true;
        await pending;
      }
      await route.fulfill({ json: result(kind, kind === "image" ? 1 : 0) });
    });
    await expect(
      page.getByRole("heading", { name: "图片模板", exact: true }),
    ).toBeVisible();
    const before = await controls(page);
    const region = page.getByRole("region", { name: "模板列表" });
    const height = (await region.boundingBox())!.height;
    await page.getByRole("button", { name: "视频", exact: true }).click();
    await expect.poll(() => arrived).toBe(true);
    try {
      await expect(region).toHaveAttribute("aria-busy", "true");
      await expect(page.locator(".studio-card")).toHaveCount(0);
      await expect(page.locator(".catalog-caption")).toContainText(
        "正在加载模板",
      );
      await expect(page.getByText("暂无创作模板", { exact: true })).toHaveCount(
        0,
      );
      stable(await controls(page), before);
      expect((await region.boundingBox())!.height).toBeGreaterThanOrEqual(
        height - 1,
      );
      await page.screenshot({
        path: `../.runtime/template-switch-loading-${width}.png`,
        fullPage: true,
      });
    } finally {
      release();
    }
    await expect(page.locator(".catalog-caption")).toContainText("0 个模板");
    await expect(page.getByText("暂无创作模板", { exact: true })).toBeVisible();
    stable(await controls(page), before);
    await page.getByRole("button", { name: "图片", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "图片模板", exact: true }),
    ).toBeVisible();
    await expect(region).toHaveAttribute("aria-busy", "false");
    expect(calls).toEqual(["image", "video"]);
    stable(await controls(page), before);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
}

test("an error stays below the toolbar and retry does not revive another tab's cards", async ({
  page,
}) => {
  let fail = true;
  await open(page, (route) => {
    const kind = new URL(route.request().url()).searchParams.get("kind")!;
    return route.fulfill(
      kind === "video" && fail
        ? { status: 503, json: { error: "视频模板读取失败" } }
        : { json: result(kind) },
    );
  });
  await expect(
    page.getByRole("heading", { name: "图片模板", exact: true }),
  ).toBeVisible();
  const before = await controls(page);
  await page.getByRole("button", { name: "视频", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("视频模板读取失败");
  await expect(
    page.getByRole("heading", { name: "图片模板", exact: true }),
  ).toHaveCount(0);
  stable(await controls(page), before);
  fail = false;
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "视频模板", exact: true }),
  ).toBeVisible();
  stable(await controls(page), before);
});

test("publishing invalidates cached tabs so revisiting loads current records", async ({
  page,
}) => {
  let published = false;
  const calls: string[] = [];
  await open(page, (route) => {
    const kind = new URL(route.request().url()).searchParams.get("kind")!;
    calls.push(kind);
    return route.fulfill({
      json: result(
        kind,
        1,
        published,
        published && kind === "video" ? "已更新的视频模板" : undefined,
      ),
    });
  });
  await page.route("**/api/admin/templates/image-1", (route) => {
    published = true;
    return route.fulfill({
      json: { ...result("image", 1, true).items[0], version: 2 },
    });
  });
  await expect(
    page.getByRole("heading", { name: "图片模板", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "视频", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "视频模板", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "图片", exact: true }).click();
  await page.getByRole("button", { name: "上架", exact: true }).click();
  await confirmSubmission(page);
  await expect(page.getByRole("status")).toContainText("模板已发布");
  await page.getByRole("button", { name: "视频", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "已更新的视频模板", exact: true }),
  ).toBeVisible();
  expect(calls.filter((kind) => kind === "image")).toHaveLength(2);
  expect(calls.filter((kind) => kind === "video")).toHaveLength(2);
});
