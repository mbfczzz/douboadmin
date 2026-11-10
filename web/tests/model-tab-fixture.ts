import { expect, type Page, type Route } from "@playwright/test";
import { mockLogin } from "./mock-login";

export function modelPage(
  kind: string,
  options: {
    total?: number;
    page?: number;
    published?: boolean;
    name?: string;
  } = {},
) {
  const { total = 1, page = 1, published = true } = options;
  kind ||= "image";
  return {
    page,
    total,
    size: 20,
    items: total
      ? [
          {
            id: `${kind}-model`,
            version: 1,
            createdAt: "2026-11-10T00:00:00Z",
            data: {
              id: `${kind}-model`,
              key: `${kind}-fixture`,
              name:
                options.name ||
                (kind === "image" ? "图片模型条目" : "视频模型条目"),
              kind,
              published,
              available: true,
              points: 2,
              creditCost: 2,
              recentJobs: 0,
              sort: 0,
              resolutions: ["1k"],
              ratios: ["1:1"],
              qualities: [],
              modes: [kind === "image" ? "t2i" : "t2v"],
              durations: [],
              operations: [],
              paramsSchema: {},
              priceModifiers: {},
              referenceTypes: [],
              syncedAt: "",
              demo: false,
              settings: {},
            },
          },
        ]
      : [],
  };
}
export async function openModels(
  page: Page,
  handler: (route: Route) => Promise<void>,
) {
  await mockLogin(page);
  await page.route("**/api/admin/models?*", handler);
  await page.goto("/#models");
}
export async function modelControls(page: Page) {
  return page.locator(".catalog-toolbar").evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
}
export function expectStableModelControls(
  actual: Awaited<ReturnType<typeof modelControls>>,
  before: Awaited<ReturnType<typeof modelControls>>,
) {
  for (const key of ["x", "y", "width", "height"] as const)
    expect(Math.abs(actual[key] - before[key]), key).toBeLessThanOrEqual(1);
}
