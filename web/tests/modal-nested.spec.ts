import { expect, test } from "@playwright/test";
import { login } from "./helpers";
import { inspectModal, closeTop } from "./modal-audit";
import { modalPartnerFixtures } from "./modal-partner-fixtures";

for (const width of [1440, 390, 320]) {
  test(`all provider child dialogs at ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    page.setDefaultTimeout(10000);
    await login(page);
    await modalPartnerFixtures(page);
    await page.getByRole("button", { name: "服务商管理", exact: true }).click();
    await page.setViewportSize({ width, height: 900 });
    const audit = (name: string) => inspectModal(page, `${width}-${name}`);
    const top = () => page.getByRole("dialog").last();
    await page
      .getByRole("button", { name: "新增分公司", exact: true })
      .first()
      .click();
    await audit("新增分公司");
    await closeTop(page);
    const row = page.locator(".provider-tree-row").first();
    const open = async (button: string, title: string) => {
      await row.getByRole("button", { name: button, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: title, exact: true });
      await expect(dialog).toBeVisible();
      return dialog;
    };
    const editor = await open("编辑", "编辑服务商");
    await expect(editor.getByLabel("服务商名称")).toBeVisible();
    await audit("编辑服务商");
    await closeTop(page);
    await open("登录账号", "登录账号");
    await audit("登录账号");
    await closeTop(page);

    const codes = await open("分享码", "分享码");
    await codes.getByRole("button", { name: "重置", exact: true }).click();
    await audit("重置S1服务商邀请码");
    await closeTop(page);
    for (const action of ["停用", "解绑"]) {
      await codes.getByRole("button", { name: action, exact: true }).click();
      await audit(`${action}用户授权`);
      await closeTop(page);
    }
    await closeTop(page);

    const commissions = await open("分佣", "算力分佣");
    await commissions
      .getByRole("button", { name: "qa-order", exact: true })
      .click();
    await expect(top().getByText("分佣对象", { exact: true })).toBeVisible();
    await audit("充值分佣快照");
    await closeTop(page);
    await commissions
      .getByRole("button", { name: "申请提现", exact: true })
      .click();
    await audit("申请提现");
    await closeTop(page);
    for (const action of ["确认打款", "取消提现"]) {
      await commissions
        .getByRole("button", { name: action, exact: true })
        .click();
      await audit(action);
      await closeTop(page);
    }
    await closeTop(page);
    await page.getByRole("button", { name: "快速跳转", exact: true }).click();
    await audit("快速跳转");
    await top().getByLabel("搜索后台功能").fill("不存在的页面");
    await expect(top().getByText("没有匹配的后台功能")).toBeVisible();
    await audit("快速跳转-空状态");
    await closeTop(page);
  });
}
