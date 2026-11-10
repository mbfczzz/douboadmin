import { expect, test } from "@playwright/test";
import {
  modelPage,
  openModels,
  modelControls,
  expectStableModelControls as stable,
} from "./model-tab-fixture";

for (const width of [1440, 390, 320]) {
  test(`delayed model category switches keep toolbar and list space stable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    let release!: () => void,
      arrived = false;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: string[] = [];
    await openModels(page, async (route) => {
      const kind = new URL(route.request().url()).searchParams.get("kind")!;
      calls.push(kind);
      if (kind === "video") {
        arrived = true;
        await pending;
      }
      await route.fulfill({
        json: modelPage(kind, { total: kind === "video" ? 0 : 1 }),
      });
    });
    await expect(page.getByText("图片模型条目", { exact: true })).toBeVisible();
    const before = await modelControls(page),
      region = page.getByRole("region", { name: "模型列表", exact: true });
    const height = (await region.boundingBox())!.height;
    await page.getByRole("tab", { name: "视频模型", exact: true }).click();
    await expect.poll(() => arrived).toBe(true);
    try {
      await expect(region).toHaveAttribute("aria-busy", "true");
      await expect(page.getByText("图片模型条目", { exact: true })).toHaveCount(
        0,
      );
      await expect(page.locator(".catalog-head")).toContainText("正在加载模型");
      await expect(
        page.getByText("没有匹配的模型", { exact: true }),
      ).toHaveCount(0);
      stable(await modelControls(page), before);
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
        path: `../.runtime/model-tab-loading-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
    } finally {
      release();
    }
    await expect(
      page.getByText("没有匹配的模型", { exact: true }),
    ).toBeVisible();
    stable(await modelControls(page), before);
    await page.getByRole("tab", { name: "全部", exact: true }).click();
    await expect(page.getByText("图片模型条目", { exact: true })).toBeVisible();
    await expect(region).toHaveAttribute("aria-busy", "false");
    expect(calls).toEqual(["", "video"]);
    stable(await modelControls(page), before);
  });
}

test("failed category stays below tabs and retries only its own rows", async ({
  page,
}) => {
  let fail = true;
  await openModels(page, (route) => {
    const kind = new URL(route.request().url()).searchParams.get("kind")!;
    return route.fulfill(
      kind === "video" && fail
        ? { status: 503, json: { error: "视频模型读取失败" } }
        : { json: modelPage(kind) },
    );
  });
  await expect(page.getByText("图片模型条目", { exact: true })).toBeVisible();
  const before = await modelControls(page);
  await page.getByRole("tab", { name: "视频模型", exact: true }).click();
  const region = page.getByRole("region", { name: "模型列表", exact: true });
  await expect(region.getByRole("alert")).toContainText("视频模型读取失败");
  await expect(page.getByText("图片模型条目", { exact: true })).toHaveCount(0);
  stable(await modelControls(page), before);
  fail = false;
  await region.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.getByText("视频模型条目", { exact: true })).toBeVisible();
  stable(await modelControls(page), before);
});
