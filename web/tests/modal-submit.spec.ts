import { expect, test } from "@playwright/test";
import { confirmSubmission, login } from "./helpers";
import { modalPartnerFixtures } from "./modal-partner-fixtures";
import { submitCases } from "./modal-submit-cases";

for (const sample of submitCases) {
  test(`${sample.name}: pending close is blocked and failed input survives`, async ({
    page,
  }) => {
    await login(page);
    await modalPartnerFixtures(page);
    await page.getByRole("button", { name: sample.nav, exact: true }).click();
    if (sample.tab)
      await page.getByRole("tab", { name: sample.tab, exact: true }).click();
    if (sample.module)
      await page
        .locator(".provider-tree-row")
        .first()
        .getByRole("button", { name: sample.module, exact: true })
        .click();
    await (sample.module ? page.getByRole("dialog").last() : page)
      .getByRole("button", { name: sample.open, exact: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog").last();
    const field = (label: string) =>
      dialog
        .getByLabel(label, { exact: true })
        .or(dialog.getByRole("textbox", { name: label, exact: true }));
    for (const [label, value] of Object.entries(sample.fields))
      await field(label).fill(value);
    const count = await page.getByRole("dialog").count();
    let release!: () => void,
      submitted = 0;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**/api/admin${sample.endpoint}`, async (route) => {
      if (route.request().method() === "GET") return route.fallback();
      submitted++;
      await pending;
      await route.fulfill({
        status: 503,
        json: { error: "界面测试：提交失败，请重试" },
      });
    });
    await dialog
      .getByRole("button", { name: sample.submit, exact: true })
      .click();
    if (
      !sample.direct &&
      !["管理账号", "模型导入", "新增分公司"].includes(sample.name)
    )
      await confirmSubmission(page);
    await expect.poll(() => submitted).toBe(1);
    try {
      for (const label of Object.keys(sample.fields))
        await expect(field(label)).toBeDisabled();
      await dialog.getByRole("button", { name: "关闭", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(count);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(count);
    } finally {
      release();
    }
    await expect(
      page.getByText("界面测试：提交失败，请重试", { exact: true }),
    ).toBeVisible();
    for (const [label, value] of Object.entries(sample.fields)) {
      await expect(field(label)).toBeEnabled();
      await expect(field(label)).toHaveValue(value);
    }
  });
}
