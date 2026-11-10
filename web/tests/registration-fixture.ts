import { expect, type Page, type Route } from "@playwright/test";
import { mockLogin } from "./mock-login";

export function registration(
  status = "pending",
  name = "待处理登记",
  id = "scan-user",
) {
  return {
    id,
    version: 1,
    createdAt: "2026-11-10T00:00:00Z",
    data: {
      role: "branch",
      partnerId: "review-branch",
      parentId: "root",
      codeKind: "bind",
      canReview: true,
      code: "ABCD2345",
      method: "scan",
      name,
      phone: "13900000000",
      status,
    },
  };
}
export function registrations(items: ReturnType<typeof registration>[] = []) {
  return { items, page: 1, size: 20, total: items.length };
}
export async function openRegistrations(
  page: Page,
  handler: (route: Route) => Promise<void>,
) {
  await mockLogin(page);
  await page.route("**/api/admin/users?*", (route) =>
    route.fulfill({ json: registrations() }),
  );
  await page.route("**/api/admin/partners/tree", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/admin/registrations?*", handler);
  await page.goto("/#users");
  await page.getByRole("tab", { name: "扫码登记", exact: true }).click();
  await expect(page.locator(".registrations .toolbar")).toBeVisible();
}
export async function registrationControls(page: Page) {
  return page.locator(".registrations .toolbar").evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
}
export function expectStableRegistrationControls(
  actual: Awaited<ReturnType<typeof registrationControls>>,
  before: Awaited<ReturnType<typeof registrationControls>>,
) {
  for (const key of ["x", "y", "width", "height"] as const)
    expect(Math.abs(actual[key] - before[key]), key).toBeLessThanOrEqual(1);
}
