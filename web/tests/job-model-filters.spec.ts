import { test, expect } from "@playwright/test";
import { mockLogin } from "./mock-login";

for (const width of [1440, 390]) {
  test(`job model categories and individual models at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockLogin(page);
    const calls: URL[] = [];
    await page.route("**/api/admin/models", (route) =>
      route.fulfill({
        json: [
          { id: "image-a", data: { name: "图片甲", kind: "image" } },
          {
            id: "image-b",
            data: { name: "图片乙（已下架）", kind: "image", published: false },
          },
          { id: "video-a", data: { name: "视频甲", kind: "video" } },
          { id: "video-b", data: { name: "视频乙", kind: "video" } },
          { id: "chat-a", data: { name: "文本甲", kind: "chat" } },
        ],
      }),
    );
    await page.route("**/api/admin/jobs?*", (route) => {
      const url = new URL(route.request().url());
      calls.push(url);
      const params = url.searchParams;
      const number = Number(params.get("page"));
      const kind = params.get("kind") || "all";
      const model = params.get("model") || "all";
      return route.fulfill({
        json: {
          page: number,
          size: 20,
          total: model === "all" ? 45 : 23,
          items: [
            {
              id: `${kind}-${model}-${number}`,
              status: "running",
              progress: 50,
              input: {
                kind: kind === "all" ? "image" : kind,
                model,
                prompt: `${kind}/${model}/page${number}`,
              },
              createdAt: "2026-11-21T04:00:00Z",
            },
          ],
        },
      });
    });
    if (width < 640)
      await page.getByRole("button", { name: "切换菜单", exact: true }).click();
    await page.getByRole("button", { name: "生成任务", exact: true }).click();
    const category = page.getByLabel("任务分类", { exact: true });
    const models = page.getByLabel("任务模型", { exact: true });
    await expect(
      page.getByRole("region", { name: "生成任务列表" }),
    ).toContainText("all/all/page1");
    await page.getByRole("button", { name: "下一页", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "生成任务列表" }),
    ).toContainText("all/all/page2");

    await category.selectOption("image");
    await expect(
      page.getByRole("region", { name: "生成任务列表" }),
    ).toContainText("image/all/page1");
    await expect(models.locator("option")).toHaveText([
      "全部图片模型",
      "图片甲",
      "图片乙（已下架）",
    ]);
    await models.click();
    await page.screenshot({
      path: testInfo.outputPath("image-model-picker.png"),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    expect(calls.at(-1)?.searchParams.get("model")).toBe("");
    await models.selectOption("image-a");
    await expect(
      page.getByRole("region", { name: "生成任务列表" }),
    ).toContainText("image/image-a/page1");
    await page.getByRole("button", { name: "下一页", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "生成任务列表" }),
    ).toContainText("image/image-a/page2");
    await models.selectOption("");
    await expect(
      page.getByRole("region", { name: "生成任务列表" }),
    ).toContainText("image/all/page1");
    await models.selectOption("image-b");
    await expect(
      page.getByRole("region", { name: "生成任务列表" }),
    ).toContainText("image/image-b/page1");

    await category.selectOption("video");
    await expect(models).toHaveValue("");
    await expect(
      page.getByRole("region", { name: "生成任务列表" }),
    ).toContainText("video/all/page1");
    await expect(models.locator("option")).toHaveText([
      "全部视频模型",
      "视频甲",
      "视频乙",
    ]);
    await models.selectOption("video-b");
    await expect(
      page.getByRole("region", { name: "生成任务列表" }),
    ).toContainText("video/video-b/page1");
    await page.reload();
    await expect(category).toHaveValue("video");
    await expect(models).toHaveValue("video-b");
    await expect(
      page.getByRole("region", { name: "生成任务列表" }),
    ).toContainText("video/video-b/page1");
    await models.selectOption("");
    await expect(
      page.getByRole("region", { name: "生成任务列表" }),
    ).toContainText("video/all/page1");

    await category.selectOption("");
    await expect(
      page.getByRole("region", { name: "生成任务列表" }),
    ).toContainText("all/all/page1");
    await expect(models.locator("option")).toHaveText([
      "全部模型",
      "图片甲",
      "图片乙（已下架）",
      "视频甲",
      "视频乙",
      "文本甲",
    ]);
    await models.selectOption("chat-a");
    await expect(
      page.getByRole("region", { name: "生成任务列表" }),
    ).toContainText("all/chat-a/page1");
    expect(
      await page
        .locator(".jobs-extra-filters")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
  });
}
