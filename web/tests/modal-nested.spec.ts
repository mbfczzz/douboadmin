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
      .getByRole("button", { name: "新增子级", exact: true })
      .first()
      .click();
    await audit("新增下级服务商");
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

    const quotas = await open("名额划拨", "名额划拨");
    await audit("名额划拨");
    await quotas.getByRole("button", { name: "划拨名额", exact: true }).click();
    await audit("划拨名额-未选择");
    await top().getByRole("button", { name: "选择直接下级服务商" }).click();
    await expect(
      top().getByRole("button", { name: "选择", exact: true }),
    ).toBeVisible();
    await audit("三级弹窗-服务商选择");
    await top().getByRole("button", { name: "选择", exact: true }).click();
    await expect(
      top().getByText("目标可用名额", { exact: true }),
    ).toBeVisible();
    await audit("划拨名额-已选择");
    await closeTop(page);
    await quotas.getByRole("button", { name: "收回名额", exact: true }).click();
    await top().getByRole("button", { name: "选择直接下级服务商" }).click();
    await top().getByRole("button", { name: "选择", exact: true }).click();
    await expect(
      top().getByRole("button", { name: "确认收回 1 个名额" }),
    ).toHaveClass(/primary danger/);
    await audit("收回名额");
    await closeTop(page);
    await quotas
      .getByRole("button", { name: "向上级申请", exact: true })
      .click();
    await audit("向上级申请名额");
    await closeTop(page);
    await quotas.getByRole("button", { name: "批准", exact: true }).click();
    await audit("批准名额申请");
    await closeTop(page);
    await quotas.getByRole("button", { name: "拒绝", exact: true }).click();
    await audit("拒绝名额申请");
    await closeTop(page);
    await closeTop(page);

    const codes = await open("授权码", "授权激活");
    await codes
      .getByRole("button", { name: "生成授权码", exact: true })
      .click();
    await audit("生成授权码");
    await closeTop(page);
    await codes
      .getByRole("button", { name: "查看二维码", exact: true })
      .click();
    await expect(top().getByAltText("豆播授权二维码")).toBeVisible();
    await audit("授权二维码-激活码");
    await closeTop(page);
    await codes.getByRole("button", { name: "来源记录", exact: true }).click();
    await expect(top().getByText("生成账号", { exact: true })).toBeVisible();
    await expect(top().locator("dl > dt")).toHaveCount(13);
    await expect(top().locator("dl > dd")).toHaveCount(13);
    await audit("二维码生成与激活记录");
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
