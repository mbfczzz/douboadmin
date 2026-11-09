import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Row, Model, Template } from "../src/api";

export async function confirmSubmission(page: Page) {
  const dialog = page.locator('[role="dialog"].save-confirmation');
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "确认提交", exact: true }).click();
}

export async function login(page: Page) {
  await page.goto("/");
  await page
    .getByLabel("账号", { exact: true })
    .fill(process.env.ADMIN_USER || "admin");
  await page
    .getByLabel("密码", { exact: true })
    .fill(process.env.ADMIN_PASSWORD || "doubo-demo-2026");
  await page.getByRole("button", { name: "登录管理台" }).click();
  await expect(page.getByRole("heading", { name: "工作概览" })).toBeVisible();
}
export async function catalog(page: Page): Promise<Row<Model>[]> {
  const res = await page.request.get("/api/admin/models");
  expect(res.status()).toBe(200);
  return res.json();
}
export async function cover(page: Page) {
  const res = await page.request.post("/api/admin/assets?purpose=cover", {
    multipart: {
      file: {
        name: "fixture.jpg",
        mimeType: "image/jpeg",
        buffer: readFileSync("../media/design/cover-1.jpg"),
      },
    },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}
export async function createTemplate(
  page: Page,
  published = false,
): Promise<Row<Template>> {
  const models = await catalog(page),
    m = models.find(
      (r) => r.data.kind === "image" && r.data.published && r.data.available,
    )!;
  expect(m).toBeTruthy();
  const image = await cover(page),
    id = "e2e-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
  const data: Template = {
    title: id,
    category: "测试分类",
    kind: "image",
    family: "style",
    cover: image.data.url,
    coverAssetId: image.id,
    prompt: "一张窗边静物摄影",
    description: "浏览器回归测试，结束后删除",
    published,
    sort: 0,
    requiredImages: 0,
    model: m.id,
    resolution: m.data.resolutions[0] || "",
    ratio: m.data.ratios[0] || "",
    quality: m.data.qualities[0] || "",
    duration: 0,
    mode: "t2i",
  };
  const res = await page.request.put("/api/admin/templates/" + id, {
    data: { version: 0, data },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}
export async function removeTemplate(page: Page, id: string) {
  const response = await page.request.get("/api/admin/templates");
  expect(response.status()).toBe(200);
  const rows: Row<Template>[] = await response.json();
  const row = rows.find((r) => r.id === id);
  if (row)
    expect(
      (
        await page.request.delete("/api/admin/templates/" + id, {
          data: { version: row.version },
        })
      ).ok(),
    ).toBeTruthy();
}

// Answers the in-app confirmation dialog (replaces browser confirm/prompt).
export async function answerAsk(page: Page, accept: boolean) {
  const dialog = page.locator('[role="dialog"].ask-dialog');
  await expect(dialog).toBeVisible();
  await (
    accept
      ? dialog.locator(".modal-actions .primary")
      : dialog.getByRole("button", { name: "取消", exact: true })
  ).click();
  await expect(dialog).toHaveCount(0);
}
