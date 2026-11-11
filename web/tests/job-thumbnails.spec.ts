import { test, expect } from "@playwright/test";
import { mockLogin } from "./mock-login";

const image = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#9bcbaa"/><circle cx="80" cy="60" r="28" fill="#22332a"/></svg>`;
for (const width of [1440, 390]) {
  test(`image and video results show thumbnails at ${width}px`, async ({
    page,
  }) => {
    await mockLogin(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.route("**/preview-fixture/*", (r) =>
      r.fulfill({ contentType: "image/svg+xml", body: image }),
    );
    const rows = ["image", "video", "chat"].map((kind, i) => ({
      id: `preview-job-${i}`,
      userId: "user-one",
      status: "succeeded",
      progress: 100,
      input: { kind, prompt: `预览测试${kind}`, model: "model", assets: [] },
      createdAt: "2026-11-11T01:00:00Z",
      updatedAt: "2026-11-11T01:00:00Z",
      result:
        kind === "chat"
          ? "文本结果"
          : `https://fixture.test/original.${kind === "image" ? "jpg" : "mp4"}`,
      thumbnailUrl:
        kind === "chat" ? undefined : `/preview-fixture/${kind}.svg`,
    }));
    await page.route(/\/api\/admin\/jobs\?/, (r) =>
      r.fulfill({ json: { items: rows, total: 3, page: 1, size: 20 } }),
    );
    if (width < 640)
      await page.getByRole("button", { name: "切换菜单", exact: true }).click();
    await page.getByRole("button", { name: "生成任务", exact: true }).click();
    for (const name of ["生成图片缩略图", "视频封面"]) {
      const img = page.getByRole("img", { name, exact: true });
      await expect(img).toBeVisible();
      await expect
        .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
        .toBeGreaterThan(0);
      const box = await img.boundingBox();
      expect(box!.width).toBe(48);
      expect(box!.height).toBe(48);
    }
    await expect(page.locator(".job-thumbnail video")).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `../.runtime/job-thumbnails-${width}.png`,
      fullPage: true,
    });
  });
}

test("failed thumbnail falls back to the image result and then to a stable icon", async ({
  page,
}) => {
  await mockLogin(page);
  let calls = 0;
  await page.route("**/preview-broken/*", (r) => {
    calls++;
    return r.fulfill({ status: 404, body: "missing" });
  });
  await page.route(/\/api\/admin\/jobs\?/, (r) =>
    r.fulfill({
      json: {
        items: [
          {
            id: "broken-image",
            userId: "u",
            status: "succeeded",
            input: {
              kind: "image",
              prompt: "失效封面",
              model: "model",
              assets: [],
            },
            result: "/preview-broken/original.jpg",
            thumbnailUrl: "/preview-broken/thumb.jpg",
            createdAt: "2026-11-11",
            updatedAt: "2026-11-11",
          },
        ],
        total: 1,
        page: 1,
        size: 20,
      },
    }),
  );
  await page.getByRole("button", { name: "生成任务", exact: true }).click();
  await expect.poll(() => calls).toBe(2);
  await expect(page.locator(".job-thumbnail img")).toHaveCount(0);
  await expect(page.locator(".job-thumbnail svg")).toBeVisible();
  await expect(page.getByRole("button", { name: /详情/ })).toBeVisible();
});

test("status refresh does not download the same cover for every renewed signature", async ({
  page,
}) => {
  await mockLogin(page);
  let loads = 0,
    version = 0;
  await page.route("**/preview-fixture/**", (r) => {
    loads++;
    return r.fulfill({ contentType: "image/svg+xml", body: image });
  });
  await page.route(/\/api\/admin\/jobs\?/, (r) =>
    r.fulfill({
      json: {
        items: [
          {
            id: "stable-job",
            userId: "u",
            status: "succeeded",
            input: { kind: "image", prompt: "重复签名测试", assets: [] },
            result: "/original.jpg",
            thumbnailUrl: `/preview-fixture/stable.svg?x-oss-signature=${++version}&x-oss-process=image/resize,w_160`,
            createdAt: "2026-11-11",
            updatedAt: "2026-11-11",
          },
        ],
        total: 1,
        page: 1,
        size: 20,
      },
    }),
  );
  await page.getByRole("button", { name: "生成任务", exact: true }).click();
  const img = page.getByRole("img", { name: "生成图片缩略图" });
  await expect
    .poll(() => img.evaluate((e: HTMLImageElement) => e.naturalWidth))
    .toBeGreaterThan(0);
  const first = await img.getAttribute("src");
  const before = version;
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await expect.poll(() => version).toBeGreaterThan(before);
  await expect(img).toHaveAttribute("src", first!);
  expect(loads).toBe(1);
});
