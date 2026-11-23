import { test, expect } from "@playwright/test";
import { mockLogin } from "./mock-login";

// An MP4 header Go's content sniffing (and the browser) treat as video/mp4.
const mp4 = Buffer.concat([
  Buffer.from("\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom", "binary"),
  Buffer.alloc(64),
]);

for (const width of [1440, 390]) {
  test(`super admin uploads a work for a user at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockLogin(page);
    let items: unknown[] = [];
    const posts: string[] = [];
    await page.route("**/api/admin/works?*", (route) =>
      route.fulfill({ json: { items, total: items.length } }),
    );
    await page.route("**/api/admin/works", async (route) => {
      const body = route.request().postData() || "";
      posts.push(body);
      if (!body.includes("13800000001"))
        return route.fulfill({
          status: 400,
          json: { error: "没有找到使用该手机号的用户" },
        });
      items = [
        {
          id: "upload-work",
          userId: "user-a",
          status: "succeeded",
          modelName: "用户上传",
          createdAt: "2026-11-23T10:00:00Z",
          input: {
            kind: "video",
            prompt: "门店宣传片",
            assets: [],
            source: "upload",
          },
        },
      ];
      return route.fulfill({ status: 201, json: items[0] });
    });
    await page.goto("/#works");
    await page.getByRole("button", { name: "上传作品", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "为用户上传作品" });
    await dialog.getByLabel("作品标题").fill("门店宣传片");
    await dialog.getByLabel("视频文件").setInputFiles({
      name: "clip.png",
      mimeType: "image/png",
      buffer: Buffer.from("png"),
    });
    await dialog.getByLabel("用户手机号或用户编号").fill("13900000000");
    await dialog.getByRole("button", { name: "上传作品" }).click();
    await expect(dialog.getByRole("alert")).toContainText("MP4");
    expect(posts).toHaveLength(0);
    await dialog.getByLabel("视频文件").setInputFiles({
      name: "clip.mp4",
      mimeType: "video/mp4",
      buffer: mp4,
    });
    await dialog.getByRole("button", { name: "上传作品" }).click();
    await expect(dialog.getByRole("alert")).toContainText("没有找到");
    await dialog.getByLabel("用户手机号或用户编号").fill("13800000001");
    await dialog.getByRole("button", { name: "上传作品" }).click();
    await expect(dialog).toBeHidden();
    expect(posts).toHaveLength(2);
    expect(posts[1]).toContain('name="title"');
    expect(posts[1]).toContain("门店宣传片");
    // Desktop shows a table row, phones a card; both name the work's source.
    await expect(page.getByText("门店宣传片").first()).toBeVisible();
    await expect(page.getByText("用户上传").first()).toBeVisible();
  });
}
