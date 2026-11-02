import { test, expect } from "@playwright/test";
import { login, catalog, removeTemplate } from "./helpers";
import type { Row, Template } from "../src/api";

test("real catalog, template upload, publish, copy, unpublish and delete", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.getByRole("button", { name: "模型管理", exact: true }).click();
  await expect(page.getByRole("heading", { name: "模型目录" })).toBeVisible();
  const models = await catalog(page);
  expect(models.length).toBeGreaterThan(0);
  const m = models.find(
    (r) => r.data.kind === "image" && r.data.published && r.data.available,
  )!;
  await page.getByRole("tab", { name: "图片模型", exact: true }).click();
  await page.getByLabel("搜索模型").fill(m.data.key);
  await expect(page.locator("tbody tr").first()).toContainText(m.data.name);
  await page
    .locator("tbody tr")
    .first()
    .getByRole("button", { name: "配置", exact: true })
    .click();
  await expect(page.getByLabel("模型 ID", { exact: true })).toHaveValue(
    m.data.key,
  );
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByLabel("搜索模型").fill("");
  await page.getByRole("tab", { name: "全部", exact: true }).click();
  await page.screenshot({
    path: "../.runtime/relay-models.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "创作模板", exact: true }).click();
  await page.getByRole("button", { name: "新增模板", exact: true }).click();
  const title = "e2e-browser-" + Date.now();
  const ids: string[] = [];
  try {
    await page.getByLabel("模板名称").fill(title);
    await page
      .getByLabel("上传封面", { exact: true })
      .setInputFiles("../media/design/cover-1.jpg");
    await expect(page.getByAltText("模板封面预览")).toBeVisible();
    await page
      .getByLabel("生成提示词")
      .fill("一张窗边静物摄影，柔和日光和自然阴影。");
    await page.getByLabel("关联模型").selectOption(m.id);
    await page.getByLabel("保存后发布到小程序").check();
    const saved = page.waitForResponse(
      (r) =>
        r.request().method() === "PUT" &&
        r.url().includes("/api/admin/templates/"),
    );
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    const response = await saved;
    expect(response.ok()).toBeTruthy();
    const record: Row<Template> = await response.json();
    ids.push(record.id);
    const card = page
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    await expect(card).toBeVisible();
    const publicRows: Row<Template>[] = await (
      await page.request.get("/api/templates")
    ).json();
    expect(
      publicRows.some((r) => r.id === record.id && r.data.model === m.id),
    ).toBeTruthy();
    await page.screenshot({
      path: "../.runtime/relay-templates.png",
      fullPage: true,
    });
    await card.getByRole("button", { name: "复制", exact: true }).click();
    await expect(page.getByLabel("模板名称")).toHaveValue(title + " 副本");
    const copied = page.waitForResponse(
      (r) =>
        r.request().method() === "PUT" &&
        r.url().includes("/api/admin/templates/"),
    );
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    const copy: Row<Template> = await (await copied).json();
    ids.push(copy.id);
    expect(copy.data.published).toBeFalsy();
    await card.getByRole("button", { name: "下架", exact: true }).click();
    await expect(card.getByText("草稿", { exact: true })).toBeVisible();
    expect(
      (await page.request.get("/api/templates/" + record.id)).status(),
    ).toBe(404);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    expect(errors).toEqual([]);
  } finally {
    for (const id of ids) await removeTemplate(page, id);
  }
});
