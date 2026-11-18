import { test, expect } from "@playwright/test";
import { mockLogin } from "./mock-login";

for (const width of [1440, 390]) {
  test(`admin confirms featuring and withdrawing works at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockLogin(page);
    let featured = false,
      version = 0;
    const writes: unknown[] = [];
    const result = "https://fixture.test/1.png";
    await page.route("**/api/admin/works?*", (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: "feature-work",
              userId: "user-a",
              status: "succeeded",
              result,
              results: [result, "https://fixture.test/2.png"],
              featured,
              workMetaVersion: version,
              createdAt: "2026-11-15T10:00:00Z",
              thumbnailUrl: "https://fixture.test/thumb.png",
              templateTitle: "W01 社区日常综合宣传",
              input: { kind: "image", prompt: "【本次参考素材对应关系】私有配方", assets: [] },
            },
          ],
          total: 1,
        },
      }),
    );
    await page.route("**/api/admin/works/feature-work/featured", (route) => {
      const body = route.request().postDataJSON();
      expect(body.version).toBe(version);
      writes.push(body);
      featured = body.featured;
      version = version ? version + 1 : 2;
      return route.fulfill({ json: { ok: true } });
    });
    await page.route("https://fixture.test/**", (route) =>
      route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") }),
    );
    await page.goto("/#works");
    // Each row shows its small cover and the template's name, not the recipe.
    await expect(page.locator(".job-thumbnail img").first()).toBeVisible();
    await expect(page.getByText("W01 社区日常综合宣传")).toBeVisible();
    await page.getByRole("button", { name: "设为优秀", exact: true }).click();
    const confirm = page.getByRole("dialog", {
      name: "设为优秀作品？",
      exact: true,
    });
    await expect(confirm).toContainText("公开展示");
    expect(writes).toHaveLength(0);
    await confirm.getByRole("button", { name: "取消", exact: true }).click();
    expect(writes).toHaveLength(0);
    await page.getByRole("button", { name: "设为优秀", exact: true }).click();
    await confirm
      .getByRole("button", { name: "确认展示", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "取消优秀", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("优秀作品", { exact: true })).toBeVisible();
    await page.screenshot({ path: `../.runtime/featured-admin-${width}.png` });
    await page.getByRole("button", { name: "预览", exact: true }).click();
    const preview = page.getByRole("dialog", { name: "作品预览", exact: true });
    await expect(preview.locator("img")).toHaveCount(2);
    await preview.getByRole("button", { name: "关闭", exact: true }).click();
    await page.getByRole("button", { name: "取消优秀", exact: true }).click();
    await page
      .getByRole("dialog", { name: "取消优秀作品？", exact: true })
      .getByRole("button", { name: "取消优秀", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "设为优秀", exact: true }),
    ).toBeVisible();
    expect(writes).toEqual([
      { featured: true, version: 0 },
      { featured: false, version: 2 },
    ]);
  });
}
