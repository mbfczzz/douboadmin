import { expect, test } from "@playwright/test";
import { mockLogin } from "./mock-login";
import { confirmSubmission } from "./helpers";

for (const width of [1440, 390, 320]) {
  test(`templates only create and edit videos at ${width}px even with an old image preference`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() =>
      localStorage.setItem(
        "doubo-filter:templates.kind",
        JSON.stringify("image"),
      ),
    );
    await mockLogin(page);
    const model = (kind: string) => ({
      id: kind + "-model",
      version: 1,
      data: {
        name: kind === "video" ? "视频模型" : "图片模型",
        kind,
        published: true,
        available: true,
        resolutions: ["720p"],
        ratios: ["16:9"],
        qualities: [],
        durations: kind === "video" ? [5] : [],
        modes: kind === "video" ? ["t2v", "i2v"] : ["t2i", "i2i"],
        settings: {},
      },
    });
    await page.route("**/api/admin/models", (route) =>
      route.fulfill({ json: [model("image"), model("video")] }),
    );
    await page.route("**/api/admin/templates/categories", (route) =>
      route.fulfill({ json: ["测试"] }),
    );
    const rows: {
      id: string;
      version: number;
      data: Record<string, unknown>;
    }[] = [];
    const reads: string[] = [],
      writes: { version: number; data: Record<string, unknown> }[] = [];
    await page.route("**/api/admin/templates?*", (route) => {
      reads.push(new URL(route.request().url()).searchParams.get("kind") || "");
      return route.fulfill({
        json: { items: rows, page: 1, size: 12, total: rows.length },
      });
    });
    await page.route("**/api/admin/templates/*", (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      const body = route.request().postDataJSON();
      writes.push(body);
      const row = {
        id: new URL(route.request().url()).pathname.split("/").pop()!,
        version: body.version + 1,
        data: body.data,
      };
      const index = rows.findIndex((item) => item.id === row.id);
      if (index >= 0) rows[index] = row;
      else rows.push(row);
      return route.fulfill({ json: row });
    });
    await page.goto("/#templates");
    await expect(
      page.getByRole("button", { name: "图片", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "新增视频模板", exact: true })
      .click();
    let dialog = page.getByRole("dialog", {
      name: "新增视频模板",
      exact: true,
    });
    await expect(dialog.getByLabel("生成类型", { exact: true })).toHaveValue(
      "视频",
    );
    await expect(
      dialog.getByLabel("生成类型", { exact: true }),
    ).toHaveJSProperty("readOnly", true);
    await expect(
      dialog.getByRole("option", { name: "图片模型", exact: true }),
    ).toHaveCount(0);
    await dialog.getByLabel("模板名称", { exact: true }).fill("新视频模板");
    await dialog
      .getByLabel("模板封面", { exact: true })
      .fill("https://example.test/cover.jpg");
    await dialog
      .getByLabel("生成提示词", { exact: true })
      .fill("镜头缓慢推进，展示产品细节。");
    await dialog
      .getByRole("combobox", { name: "关联模型", exact: true })
      .selectOption("video-model");
    await expect(
      dialog.getByRole("combobox", { name: "视频时长", exact: true }),
    ).toHaveValue("5");
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await dialog.screenshot({
      path: `../.runtime/video-template-editor-${width}.png`,
    });
    await dialog.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0].version).toBe(0);
    expect(writes[0].data).toMatchObject({
      kind: "video",
      model: "video-model",
      duration: 5,
    });
    await page
      .locator(".studio-card")
      .filter({ hasText: "新视频模板" })
      .getByRole("button", { name: "编辑", exact: true })
      .click();
    dialog = page.getByRole("dialog", { name: "编辑视频模板", exact: true });
    await expect(dialog.getByLabel("生成类型", { exact: true })).toHaveValue(
      "视频",
    );
    await dialog
      .getByLabel("模板名称", { exact: true })
      .fill("已修改的视频模板");
    await dialog.getByRole("button", { name: "保存模板", exact: true }).click();
    expect(writes).toHaveLength(1);
    await confirmSubmission(page);
    await expect.poll(() => writes.length).toBe(2);
    expect(writes[1].data.kind).toBe("video");
    expect(reads.every((kind) => kind === "video")).toBe(true);
  });
}
