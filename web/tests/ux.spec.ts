import { test, expect } from "@playwright/test";
import { login, createTemplate, removeTemplate, catalog } from "./helpers";
import type { Row, Model } from "../src/api";

test("model availability is reflected in the public catalog", async ({
  page,
}) => {
  await login(page);
  const rows = await catalog(page),
    row = rows.find(
      (r) => r.data.kind === "image" && r.data.published && r.data.available,
    )!;
  try {
    await page.getByRole("button", { name: "模型管理", exact: true }).click();
    await page.getByLabel("搜索模型").fill(row.data.key);
    const toggle = page.getByRole("switch", {
      name: row.data.name + " 上架状态",
      exact: true,
    });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    const cfg = await (await page.request.get("/api/config")).json();
    expect(cfg.models.some((m: Model) => m.id === row.id)).toBeFalsy();
    await toggle.click();
    await expect(toggle).toBeChecked();
    const restored = await (await page.request.get("/api/config")).json();
    expect(restored.models.some((m: Model) => m.id === row.id)).toBeTruthy();
  } finally {
    const current = (await catalog(page)).find((r) => r.id === row.id)!;
    if (current.data.published !== row.data.published)
      await page.request.put("/api/admin/models/" + row.id, {
        data: { version: current.version, data: row.data },
      });
  }
});

test("unsaved edits survive cancel, focus stays in dialog and returns to opener", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "创作模板", exact: true }).click();
  const opener = page.getByRole("button", { name: "新增模板" });
  await opener.click();
  const dialog = page.getByRole("dialog"),
    title = dialog.getByLabel("模板名称");
  await expect(title).toBeFocused();
  await title.fill("这份草稿不能丢");
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "关闭", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "保存模板", exact: true }),
  ).toBeFocused();
  page.once("dialog", (d) => d.dismiss());
  await page.keyboard.press("Escape");
  await expect(title).toHaveValue("这份草稿不能丢");
  page.once("dialog", (d) => d.accept());
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(opener).toBeFocused();
});

test("version conflicts preserve a draft and require an explicit resave", async ({
  page,
}) => {
  await login(page);
  const row = await createTemplate(page);
  const edited = row.data.title + " 修改";
  try {
    await page.getByRole("button", { name: "创作模板", exact: true }).click();
    const card = page.locator("article").filter({
      has: page.getByRole("heading", { name: row.data.title, exact: true }),
    });
    await card.getByRole("button", { name: "编辑", exact: true }).click();
    await page.getByLabel("模板名称").fill(edited);
    expect(
      (
        await page.request.put("/api/admin/templates/" + row.id, {
          data: {
            version: row.version,
            data: { ...row.data, title: "其他管理员的修改" },
          },
        })
      ).ok(),
    ).toBeTruthy();
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("草稿已保留");
    await expect(page.getByRole("alert")).toBeFocused();
    await expect(page.getByLabel("模板名称")).toHaveValue(edited);
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: edited, exact: true }),
    ).toBeVisible();
  } finally {
    await removeTemplate(page, row.id);
  }
});

test("a server failure keeps loaded template content and offers retry", async ({
  page,
}) => {
  await login(page);
  const row = await createTemplate(page);
  try {
    await page.getByRole("button", { name: "创作模板", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: row.data.title, exact: true }),
    ).toBeVisible();
    await page.route("**/api/admin/templates", (route) =>
      route.fulfill({
        status: 503,
        contentType: "text/html",
        body: "unavailable",
      }),
    );
    await page.getByRole("button", { name: "刷新", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("服务暂时不可用");
    await expect(
      page.getByRole("heading", { name: row.data.title, exact: true }),
    ).toBeVisible();
    await page.unroute("**/api/admin/templates");
    await page.getByRole("button", { name: "刷新", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
  } finally {
    await removeTemplate(page, row.id);
  }
});

test("a failed login can be corrected without losing the account field", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("管理员账号").fill("admin");
  await page.getByLabel("密码", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "登录管理台" }).click();
  await expect(page.getByRole("alert")).toContainText("账号或密码不正确");
  await expect(page.getByLabel("管理员账号")).toHaveValue("admin");
  await page
    .getByLabel("密码", { exact: true })
    .fill(process.env.ADMIN_PASSWORD || "doubo-demo-2026");
  await page.getByRole("button", { name: "登录管理台" }).click();
  await expect(page.getByRole("heading", { name: "工作概览" })).toBeVisible();
});
