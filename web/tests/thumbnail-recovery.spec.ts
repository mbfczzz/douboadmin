import { test, expect, type Page } from "@playwright/test";
import { mockLogin } from "./mock-login";

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="red"/></svg>';
async function jobs(
  page: Page,
  media: () => { result: string; thumbnailUrl?: string },
) {
  await page.clock.install();
  await mockLogin(page);
  let reads = 0;
  await page.route(/\/api\/admin\/jobs\?/, (r) => {
    reads++;
    return r.fulfill({
      json: {
        items: [
          {
            id: "recovery-job",
            userId: "u",
            status: "succeeded",
            input: { kind: "image", prompt: "恢复测试", assets: [] },
            ...media(),
            createdAt: "2026-11-11",
            updatedAt: "2026-11-11",
          },
        ],
        total: 1,
        page: 1,
        size: 20,
      },
    });
  });
  return () => reads;
}
const open = (page: Page) =>
  page.getByRole("button", { name: "生成任务", exact: true }).click();

test("manual refresh keeps a healthy thumbnail mounted without another image request", async ({ page }) => {
  await jobs(page, () => ({ result: "/healthy-refresh.svg" }));
  let loads = 0;
  await page.route("**/healthy-refresh.svg", (route) => {
    loads++;
    return route.fulfill({ contentType: "image/svg+xml", body: svg });
  });
  await open(page);
  const image = page.getByRole("img", { name: "生成图片缩略图" });
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
  const node = await image.elementHandle();
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(page.getByRole("button", { name: "刷新", exact: true })).toBeEnabled();
  expect(await image.evaluate((element, previous) => element === previous, node)).toBe(true);
  expect(loads).toBe(1);
});

test("a fresh signed cover replaces a failed address during background polling", async ({
  page,
}) => {
  let fresh = false;
  const reads = await jobs(page, () => ({
    result: "/recovery-original.svg",
    thumbnailUrl: `/recovery-cover.svg?x-oss-signature=${fresh ? "fresh" : "expired"}&x-oss-process=image/resize,w_160`,
  }));
  const loads: string[] = [];
  await page.route("**/recovery-original.svg", (r) =>
    r.fulfill({ contentType: "image/svg+xml", body: svg }),
  );
  await page.route("**/recovery-cover.svg?**", (r) => {
    const sig = new URL(r.request().url()).searchParams.get("x-oss-signature")!;
    loads.push(sig);
    return sig === "fresh"
      ? r.fulfill({ contentType: "image/svg+xml", body: svg })
      : r.fulfill({ status: 403, body: "expired" });
  });
  await open(page);
  const img = page.getByRole("img", { name: "生成图片缩略图" });
  await expect(img).toHaveAttribute("src", "/recovery-original.svg");
  const before = reads();
  fresh = true;
  await page.clock.fastForward(16_000);
  await expect.poll(reads).toBeGreaterThan(before);
  await expect(img).toHaveAttribute("src", /signature=fresh/);
  await expect
    .poll(() => img.evaluate((e: HTMLImageElement) => e.naturalWidth))
    .toBeGreaterThan(0);
  expect(loads).toContain("fresh");
});

test("a temporary original-image failure recovers without manual refresh", async ({
  page,
}) => {
  await jobs(page, () => ({ result: "/recovery-original-only.svg" }));
  let healthy = false,
    loads = 0;
  await page.route("**/recovery-original-only.svg", (r) => {
    loads++;
    return healthy
      ? r.fulfill({ contentType: "image/svg+xml", body: svg })
      : r.fulfill({ status: 503, body: "temporary" });
  });
  await open(page);
  await expect(page.locator(".job-thumbnail svg")).toBeVisible();
  expect(loads).toBe(1);
  healthy = true;
  await page.clock.fastForward(16_000);
  const img = page.getByRole("img", { name: "生成图片缩略图" });
  await expect
    .poll(() => img.evaluate((e: HTMLImageElement) => e.naturalWidth))
    .toBeGreaterThan(0);
  expect(loads).toBe(2);
});

test("permanent failures stop after three retries and manual refresh can retry again", async ({
  page,
}) => {
  await jobs(page, () => ({ result: "/recovery-permanent.svg" }));
  let loads = 0;
  await page.route("**/recovery-permanent.svg", (r) => {
    loads++;
    return r.fulfill({ status: 503, body: "temporary" });
  });
  await open(page);
  await expect(page.locator(".job-thumbnail svg")).toBeVisible();
  for (const [delay, count] of [
    [16_000, 2],
    [61_000, 3],
    [181_000, 4],
  ]) {
    await page.clock.fastForward(delay);
    await expect.poll(() => loads).toBe(count);
    await expect(page.locator(".job-thumbnail svg")).toBeVisible();
  }
  await page.clock.fastForward(600_000);
  expect(loads).toBe(4);
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await expect.poll(() => loads).toBe(5);
});

test("leaving the page cancels the pending preview retry", async ({ page }) => {
  await jobs(page, () => ({ result: "/recovery-leaving.svg" }));
  let loads = 0;
  await page.route("**/recovery-leaving.svg", (r) => {
    loads++;
    return r.fulfill({ status: 503, body: "temporary" });
  });
  await open(page);
  await expect(page.locator(".job-thumbnail svg")).toBeVisible();
  await page.getByRole("button", { name: "充值订单", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "充值订单", exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(300_000);
  expect(loads).toBe(1);
});

test("hidden pages postpone retries until they become visible", async ({
  page,
}) => {
  await jobs(page, () => ({ result: "/recovery-hidden.svg" }));
  let loads = 0,
    healthy = false;
  await page.route("**/recovery-hidden.svg", (r) => {
    loads++;
    return healthy
      ? r.fulfill({ contentType: "image/svg+xml", body: svg })
      : r.fulfill({ status: 503, body: "temporary" });
  });
  await open(page);
  await expect(page.locator(".job-thumbnail svg")).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  healthy = true;
  await page.clock.fastForward(60_000);
  expect(loads).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const img = page.getByRole("img", { name: "生成图片缩略图" });
  await expect
    .poll(() => img.evaluate((e: HTMLImageElement) => e.naturalWidth))
    .toBeGreaterThan(0);
  expect(loads).toBe(2);
});
