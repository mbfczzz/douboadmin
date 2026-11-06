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
    await page
      .getByRole("button", { name: "编辑", exact: true })
      .first()
      .click();
    const editor = page.getByRole("dialog", {
      name: "编辑服务商",
      exact: true,
    });
    await expect(editor.getByLabel("服务商名称")).toBeVisible();
    await editor.getByRole("tab", { name: "名额划拨", exact: true }).click();
    await editor
      .getByRole("button", { name: "划拨 / 收回名额", exact: true })
      .click();
    await audit("名额划拨-未选择");
    await top().getByRole("button", { name: "选择直接下级服务商" }).click();
    await expect(
      top().getByRole("button", { name: "选择", exact: true }),
    ).toBeVisible();
    await audit("三级弹窗-服务商选择");
    await top().getByRole("button", { name: "选择", exact: true }).click();
    await expect(
      top().getByText("目标可用名额", { exact: true }),
    ).toBeVisible();
    await audit("名额划拨-已选择");
    await top()
      .getByRole("combobox", { name: "操作", exact: true })
      .selectOption("reclaim");
    await expect(
      top().getByRole("button", { name: "确认收回 1 个名额" }),
    ).toHaveClass(/primary danger/);
    await audit("名额收回");
    await closeTop(page);
    await editor
      .getByRole("button", { name: "向上级申请", exact: true })
      .click();
    await audit("向上级申请名额");
    await closeTop(page);
    await editor.getByRole("button", { name: "审批", exact: true }).click();
    await audit("名额申请审批");
    await closeTop(page);
    await editor.getByRole("tab", { name: "授权激活", exact: true }).click();
    await editor
      .getByRole("button", { name: "生成授权码", exact: true })
      .click();
    await audit("生成授权码");
    await closeTop(page);
    await editor
      .getByRole("button", { name: "查看二维码", exact: true })
      .click();
    await expect(top().getByAltText("豆播授权二维码")).toBeVisible();
    await audit("授权二维码-激活码");
    await closeTop(page);
    await editor.getByRole("button", { name: "来源记录", exact: true }).click();
    await expect(top().getByText("生成账号", { exact: true })).toBeVisible();
    await expect(top().locator("dl > dt")).toHaveCount(13);
    await expect(top().locator("dl > dd")).toHaveCount(13);
    await audit("二维码生成与激活记录");
    await closeTop(page);
    await editor.getByRole("button", { name: "管理授权", exact: true }).click();
    await audit("管理用户授权");
    await closeTop(page);
    await editor.getByRole("tab", { name: "算力分佣", exact: true }).click();
    await editor.getByRole("button", { name: "qa-order", exact: true }).click();
    await expect(top().getByText("分佣对象", { exact: true })).toBeVisible();
    await audit("充值分佣快照");
    await closeTop(page);
    await editor.getByRole("button", { name: "申请提现", exact: true }).click();
    await audit("申请提现");
    await closeTop(page);
    await editor.getByRole("button", { name: "处理提现", exact: true }).click();
    await audit("处理提现");
    await closeTop(page);
    await closeTop(page);
    await page.getByRole("button", { name: "快速跳转", exact: true }).click();
    await audit("快速跳转");
    await top().getByLabel("搜索后台功能").fill("不存在的页面");
    await expect(top().getByText("没有匹配的后台功能")).toBeVisible();
    await audit("快速跳转-空状态");
    await closeTop(page);
  });
}
