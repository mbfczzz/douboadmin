import { test, expect } from "@playwright/test";
import { login, confirmSubmission } from "./helpers";

test("profile and password share one approval; immutable username is omitted", async ({
  page,
}) => {
  await login(page);
  expect((await (await page.request.get("/api/config")).json()).storage).toBe(
    "memory",
  );
  const username = "confirm-" + Date.now();
  const response = await page.request.post("/api/admin/accounts", {
    data: {
      username,
      name: "确认测试账号",
      role: "operator",
      password: "fixture-original-password",
    },
  });
  expect(response.status()).toBe(201);
  const created = await response.json();
  try {
    await page.getByRole("button", { name: "管理账号", exact: true }).click();
    await page
      .locator("tbody tr")
      .filter({ hasText: username })
      .getByRole("button", { name: "编辑", exact: true })
      .click();
    const editor = page.getByRole("dialog", { name: "编辑管理账号" });
    await editor.getByLabel("姓名", { exact: true }).fill("修改后的账号名称");
    await editor
      .getByLabel("重置密码（不修改请留空）")
      .fill("fixture-new-password-2026");
    const writes: { url: string; body: Record<string, unknown> }[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "PUT" &&
        request.url().includes(`/api/admin/accounts/${created.id}`)
      )
        writes.push({ url: request.url(), body: request.postDataJSON() });
    });
    await editor.getByRole("button", { name: "保存账号" }).click();
    const dialog = page.getByRole("dialog", { name: "确认修改管理账号" });
    await expect(dialog).toContainText("修改后的账号名称");
    await expect(dialog).toContainText("密码");
    await expect(dialog).not.toContainText("fixture-new-password-2026");
    expect(writes).toHaveLength(0);
    await confirmSubmission(page);
    await expect(editor).toHaveCount(0);
    expect(writes).toHaveLength(2);
    expect(writes[0].body.username).toBeUndefined();
    expect(writes[1].url).toContain("/password");
    expect(writes[1].body.password).toBe("fixture-new-password-2026");
    await expect(page.locator(".save-confirmation")).toHaveCount(0);
  } finally {
    const data = await (await page.request.get("/api/admin/accounts")).json();
    const current = data.items.find(
      (row: { id: string }) => row.id === created.id,
    );
    expect(
      (
        await page.request.delete(`/api/admin/accounts/${created.id}`, {
          data: { version: current.version },
        })
      ).ok(),
    ).toBe(true);
  }
});
