import { expect, test } from "@playwright/test";
import {
  openRegistrations,
  registration,
  registrations,
} from "./registration-fixture";

for (const approve of [true, false]) {
  test(`${approve ? "approving" : "rejecting"} confirms and invalidates cached registration statuses`, async ({
    page,
  }) => {
    let status = "pending";
    const next = approve ? "approved" : "rejected",
      label = approve ? "开通" : "拒绝";
    const bodies: unknown[] = [],
      calls: string[] = [];
    await openRegistrations(page, (route) => {
      const filter = new URL(route.request().url()).searchParams.get("status")!;
      calls.push(filter);
      return route.fulfill({
        json: registrations(filter === status ? [registration(status)] : []),
      });
    });
    await page.route("**/api/admin/registrations/scan-user", (route) => {
      bodies.push(route.request().postDataJSON());
      status = next;
      return route.fulfill({ json: { ...registration(status), version: 2 } });
    });
    const region = page.getByRole("region", {
      name: "扫码登记列表",
      exact: true,
    });
    await expect(region.getByText("待处理登记")).toBeVisible();
    const nextTab = page.getByRole("button", {
      name: approve ? "已开通" : "已拒绝",
      exact: true,
    });
    await nextTab.click();
    await expect(region.getByText("暂无登记", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "待开通", exact: true }).click();
    await region.getByRole("button", { name: label, exact: true }).click();
    let dialog = page.getByRole("dialog", {
      name: `${label}登记`,
      exact: true,
    });
    await expect(dialog).toBeVisible();
    expect(bodies).toEqual([]);
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    expect(bodies).toEqual([]);
    await region.getByRole("button", { name: label, exact: true }).click();
    dialog = page.getByRole("dialog", { name: `${label}登记`, exact: true });
    const submit = dialog.getByRole("button", { name: label, exact: true });
    if (!approve) {
      await expect(submit).toBeDisabled();
      await dialog.getByLabel("拒绝原因").fill("资料不符");
    }
    await submit.click();
    await expect(dialog).toHaveCount(0);
    await expect(region.getByText("暂无登记", { exact: true })).toBeVisible();
    await expect(page.locator(".save-confirmation")).toHaveCount(0);
    await nextTab.click();
    await expect(region.getByText("待处理登记")).toBeVisible();
    expect(bodies).toEqual([
      { approve, reason: approve ? "" : "资料不符", version: 1 },
    ]);
    expect(calls.filter((filter) => filter === next)).toHaveLength(2);
    expect(calls.filter((filter) => filter === "pending")).toHaveLength(2);
    await expect(
      region.getByRole("button", { name: label, exact: true }),
    ).toHaveCount(0);
  });
}
