import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { login } from "./helpers";

test.skip(
  process.env.DOUBO_TEST_PRODUCTION_BUNDLE !== "true",
  "Requires a production preview and disposable API",
);
test.beforeEach(async ({ request }) => {
  expect((await (await request.get("/api/config")).json()).storage).toBe(
    "memory",
  );
});

function stylesheetRequests(page: Page) {
  const loaded = new Set<string>();
  page.on("request", (request) => {
    const file = new URL(request.url()).pathname;
    if (file.endsWith(".css")) loaded.add(file);
  });
  const report = JSON.parse(readFileSync("dist/budget.json", "utf8"));
  // The confirmation dialog adds shared shell CSS loaded on login. Only the
  // page's own styles must remain unloaded until its first navigation.
  const shellStyles = new Set(
    report.entries["src/Workspace.tsx"].assets
      .filter((asset: { file: string }) => asset.file.endsWith(".css"))
      .map((asset: { file: string }) => asset.file),
  );
  function files(entry: string): string[] {
    const styles = report.entries[entry].assets
      .filter(
        (asset: { file: string }) =>
          asset.file.endsWith(".css") && !shellStyles.has(asset.file),
      )
      .map((asset: { file: string }) => "/" + asset.file);
    expect(styles.length, entry + " should own its styles").toBeGreaterThan(0);
    return styles;
  }
  return { loaded, files };
}

test("model editor styles load on first entry and survive refresh and mobile layout", async ({
  page,
}) => {
  const { loaded, files } = stylesheetRequests(page);
  const styles = files("src/pages/Models.tsx");
  await login(page);
  for (const file of styles) expect(loaded.has(file)).toBe(false);
  await page.route("**/api/admin/models", (route) =>
    route.fulfill({
      json: [
        {
          id: "performance-image",
          version: 1,
          createdAt: "2026-11-08T00:00:00Z",
          data: {
            id: "performance-image",
            key: "performance-image",
            name: "Performance Model",
            kind: "image",
            points: 1,
            published: true,
            available: true,
            settings: {},
            resolutions: ["1k"],
            ratios: ["1:1"],
            qualities: ["high"],
            modes: ["t2i", "i2i"],
            referenceTypes: ["image"],
            durations: [],
            recentJobs: 0,
            creditCost: 1,
            sort: 0,
          },
        },
      ],
    }),
  );
  await page.getByRole("button", { name: "模型管理", exact: true }).click();
  await page.getByRole("button", { name: "基础信息", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "基础信息 · Performance Model",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  for (const file of styles) expect(loaded.has(file)).toBe(true);
  expect(
    await dialog.evaluate((element) => getComputedStyle(element).display),
  ).toBe("flex");
  expect((await dialog.boundingBox())!.width).toBe(1040);
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "基础信息", exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
});

test("provider and integration styles are lazy and applied on first navigation", async ({
  page,
}) => {
  const { loaded, files } = stylesheetRequests(page);
  const providers = files("chunk:partner-business"),
    settings = files("src/pages/Settings.tsx");
  await login(page);
  for (const file of [...providers, ...settings])
    expect(loaded.has(file)).toBe(false);
  await page.getByRole("button", { name: "服务商管理", exact: true }).click();
  await expect(page.locator(".partner-hub")).toBeVisible();
  for (const file of providers) expect(loaded.has(file)).toBe(true);
  expect(
    await page
      .locator(".partner-hub")
      .evaluate((element) => getComputedStyle(element).containerType),
  ).toBe("inline-size");
  for (const file of settings) expect(loaded.has(file)).toBe(false);
  await page.getByRole("button", { name: "系统设置", exact: true }).click();
  const first = page.locator("details.integration").first();
  await expect(first).toBeVisible();
  for (const file of settings) expect(loaded.has(file)).toBe(true);
  expect(
    await first.evaluate((element) => getComputedStyle(element).marginTop),
  ).toBe("16px");
});
