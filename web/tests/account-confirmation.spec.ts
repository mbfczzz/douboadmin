import { test, expect } from "@playwright/test";
import { login, confirmSubmission } from "./helpers";

test("profile edits are approved; password reset is its own action", async ({
  page,
  request,
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
    const row = page.locator("tbody tr").filter({ hasText: username });
    const writes: { url: string; body: Record<string, unknown> }[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "PUT" &&
        request.url().includes(`/api/admin/accounts/${created.id}`)
      )
        writes.push({ url: request.url(), body: request.postDataJSON() });
    });
    await row.getByRole("button", { name: "编辑", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "编辑账号资料" });
    await expect(editor.getByLabel(/密码/)).toHaveCount(0);
    await editor.getByLabel("姓名", { exact: true }).fill("修改后的账号名称");
    await editor.getByRole("button", { name: "保存资料" }).click();
    const dialog = page.getByRole("dialog", { name: "确认修改账号资料" });
    await expect(dialog).toContainText("修改后的账号名称");
    await expect(dialog).not.toContainText("密码");
    expect(writes).toHaveLength(0);
    await confirmSubmission(page);
    await expect(editor).toHaveCount(0);
    expect(writes).toHaveLength(1);
    expect(writes[0].body.username).toBeUndefined();
    expect(writes[0].body.disabled).toBe(false);

    await row.getByRole("button", { name: "重置密码", exact: true }).click();
    const reset = page.getByRole("dialog", { name: "重置密码" });
    await reset.getByRole("button", { name: "随机生成" }).click();
    const generated = await reset.getByLabel("新密码").inputValue();
    expect(generated).toMatch(/^[A-Za-z0-9]{20}$/);
    await reset.getByLabel("新密码").fill("fixture-new-password-2026");
    await reset.getByRole("button", { name: "保存新密码" }).click();
    await expect(reset).toHaveCount(0);
    // The reset dialog is the approval; no summary repeats the password.
    await expect(page.locator(".save-confirmation")).toHaveCount(0);
    expect(writes).toHaveLength(2);
    expect(writes[1].url).toContain("/password");
    expect(writes[1].body.password).toBe("fixture-new-password-2026");
    // Separate cookie jar so the admin session in the page stays signed in.
    const login = await request.post("/api/admin/login", {
      data: { username, password: "fixture-new-password-2026" },
    });
    expect(login.status()).toBe(200);
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
