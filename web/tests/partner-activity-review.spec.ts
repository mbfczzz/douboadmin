import { expect, test } from "@playwright/test";
import { mockLogin } from "./mock-login";

test("activity retries failures, appends pages and clears records after access is revoked", async ({ page }) => {
  await mockLogin(page);
  const child = { id: "activity-child", version: 1, children: 0, data: { name: "轨迹测试下级", role: "s1", parentId: "parent", path: ["root", "parent"], status: "active" } };
  await page.route("**/api/admin/partners/tree?*", r => r.fulfill({ json: { items: [child], page: 1, total: 1 } }));
  await page.route("**/api/admin/partners/activity-child", r => r.fulfill({ json: { record: child, price: { shares: [] }, commission: {} } }));
  const entry = (id: string, action: string) => ({ id, action, category: "business", actorName: "下级账号", at: "2026-11-13T08:00:00Z", status: 200 });
  let mode = "error";
  const before: string[] = [];
  await page.route("**/api/admin/partners/activity-child/activity?*", r => {
    before.push(new URL(r.request().url()).searchParams.get("before") || "");
    if (mode === "error") return r.fulfill({ status: 503, json: { error: "暂时读取失败" } });
    if (mode === "denied") return r.fulfill({ status: 403, json: { error: "活动查看权限已撤回" } });
    if (mode === "empty") return r.fulfill({ json: { items: [] } });
    return r.fulfill({ json: before.at(-1) ? { items: [entry("older", "第二页记录")], next: "older" } : { items: [entry("newer", "第一页记录")], next: "newer" } });
  });
  await page.getByRole("button", { name: "服务商管理", exact: true }).click();
  await page.getByRole("button", { name: "下级活动轨迹", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "下级活动轨迹", exact: true });
  await expect(dialog.getByRole("alert")).toContainText("暂时读取失败");
  mode = "ready";
  await dialog.getByRole("button", { name: "重试", exact: true }).click();
  await expect(dialog.getByText("第一页记录", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "加载更多", exact: true }).click();
  await expect(dialog.getByText("第二页记录", { exact: true })).toBeVisible();
  expect(before.at(-1)).toBe("newer");
  await expect(dialog.locator(".timeline li")).toHaveCount(2);
  mode = "denied";
  await dialog.getByRole("button", { name: "加载更多", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("权限已撤回");
  await expect(dialog.locator(".timeline li")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "加载更多", exact: true })).toHaveCount(0);
  mode = "empty";
  await dialog.getByRole("button", { name: "重试", exact: true }).click();
  await expect(dialog.getByText("暂无活动记录", { exact: true })).toBeVisible();
  expect(before.at(-1)).toBe("");
});
