import { expect, test } from "@playwright/test";
import {
  registration,
  registrations,
  openRegistrations,
  registrationControls,
  expectStableRegistrationControls as stable,
} from "./registration-fixture";

for (const width of [1440, 390, 320]) {
  test(`registration status tabs keep controls and content space stable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrived = false;
    const calls: string[] = [];
    await openRegistrations(page, async (route) => {
      const status = new URL(route.request().url()).searchParams.get("status")!;
      calls.push(status);
      if (status === "approved") {
        arrived = true;
        await pending;
      }
      await route.fulfill({
        json: registrations(
          status === "pending"
            ? Array.from({ length: 4 }, (_, i) =>
                registration("pending", `待处理登记${i}`, `scan-${i}`),
              )
            : [],
        ),
      });
    });
    await expect(page.getByText("待处理登记0")).toBeVisible();
    const before = await registrationControls(page);
    const region = page.getByRole("region", {
      name: "扫码登记列表",
      exact: true,
    });
    const height = (await region.boundingBox())!.height;
    await page.getByRole("button", { name: "已开通", exact: true }).click();
    await expect.poll(() => arrived).toBe(true);
    try {
      await expect(region).toHaveAttribute("aria-busy", "true");
      await expect(page.getByText("待处理登记0")).toHaveCount(0);
      await expect(region.getByText("暂无登记", { exact: true })).toHaveCount(
        0,
      );
      stable(await registrationControls(page), before);
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
        path: `../.runtime/registration-tab-loading-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
    } finally {
      release();
    }
    await expect(region.getByText("暂无登记", { exact: true })).toBeVisible();
    stable(await registrationControls(page), before);
    await page.getByRole("button", { name: "待开通", exact: true }).click();
    await expect(page.getByText("待处理登记0")).toBeVisible();
    await expect(region).toHaveAttribute("aria-busy", "false");
    expect(calls).toEqual(["pending", "approved"]);
    stable(await registrationControls(page), before);
  });
}

test("errors and retry stay below tabs; header refresh invalidates statuses only once", async ({
  page,
}) => {
  let fail = true,
    revision = 0;
  const calls: string[] = [];
  await openRegistrations(page, (route) => {
    const status = new URL(route.request().url()).searchParams.get("status")!;
    calls.push(`${status}:${revision}`);
    return route.fulfill(
      status === "approved" && fail
        ? { status: 503, json: { error: "登记列表读取失败" } }
        : {
            json: registrations([
              registration(status, `${status}登记${revision}`),
            ]),
          },
    );
  });
  await expect(page.getByText("pending登记0")).toBeVisible();
  const before = await registrationControls(page);
  await page.getByRole("button", { name: "已开通", exact: true }).click();
  const region = page.getByRole("region", {
    name: "扫码登记列表",
    exact: true,
  });
  await expect(region.getByRole("alert")).toContainText("登记列表读取失败");
  await expect(page.getByText("pending登记0")).toHaveCount(0);
  stable(await registrationControls(page), before);
  fail = false;
  await region.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.getByText("approved登记0")).toBeVisible();
  await page.getByRole("button", { name: "待开通", exact: true }).click();
  await expect(page.getByText("pending登记0")).toBeVisible();
  revision = 1;
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(page.getByText("pending登记1")).toBeVisible();
  await page.getByRole("button", { name: "已开通", exact: true }).click();
  await expect(page.getByText("approved登记1")).toBeVisible();
  await page.getByRole("button", { name: "待开通", exact: true }).click();
  await expect(page.getByText("pending登记1")).toBeVisible();
  stable(await registrationControls(page), before);
  expect(calls.filter((value) => value === "pending:1")).toHaveLength(1);
  expect(calls.filter((value) => value === "approved:1")).toHaveLength(1);
});
