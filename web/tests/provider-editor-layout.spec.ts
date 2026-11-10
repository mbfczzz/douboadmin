import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";
import { surfaceFixtures, longName } from "./surface-fixtures";

test.beforeEach(async ({ page }) => {
  await login(page);
  await surfaceFixtures(page);
  await page.getByRole("button", { name: "服务商管理", exact: true }).click();
});

const row = (page: Page) => page.locator(".provider-tree-row").first();
// Each row button opens one dialog with one job.
const functions = [
  ["编辑", "编辑服务商", "", 0],
  ["分享码", "分享码", "已加入的会员", 1],
  ["分佣", "算力分佣", "佣金流水", 2],
] as const;

test("each provider function opens its own readable, contained dialog", async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [
      index,
      [button, title, heading, lists],
    ] of functions.entries()) {
      await row(page)
        .getByRole("button", { name: button, exact: true })
        .click();
      const dialog = page.getByRole("dialog", { name: title, exact: true });
      await expect(dialog).toBeVisible();
      if (!heading) {
        await expect(dialog.getByLabel("服务商名称")).toHaveValue(longName);
        await expect(
          dialog.getByRole("button", { name: "保存服务商" }),
        ).toBeEnabled();
        // Profile only: login and codes have their own buttons.
        await expect(dialog.getByText("登录账号")).toHaveCount(0);
      } else {
        const panel = dialog.locator(".provider-panel");
        await expect(
          panel.getByRole("heading", { name: heading, exact: true }),
        ).toBeVisible();
        await expect(panel.locator(".partner-records")).toHaveCount(lists);
        const sections = await panel
          .locator(".partner-records, .share-panel")
          .evaluateAll((nodes) =>
            nodes.map((node) => {
              const box = node.getBoundingClientRect();
              return { top: box.top, bottom: box.bottom };
            }),
          );
        expect(sections[1].top - sections[0].bottom).toBeGreaterThanOrEqual(20);
        expect(await panel.locator(".panel .panel").count()).toBe(0);
        expect(
          await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        ).toBe(true);
        if (index === 1) {
          // A 分公司 has every code: 会员, S1 and S2 invites and its bind code.
          await expect(panel.getByRole("tab")).toHaveText([
            "会员开通码",
            "S1 邀请码",
            "S2 邀请码",
            "服务商绑定码",
          ]);
          await expect(panel.locator(".share-code")).toHaveText("ABCD-2345");
          await expect(panel.locator(".code-info")).toContainText(
            "用户扫码登记为会员，总部开通后生效",
          );
          await panel.getByRole("tab", { name: "S1 邀请码" }).click();
          await expect(panel.locator(".share-code")).toHaveText("KMNP-2345");
          await expect(panel.locator(".code-info")).toContainText(
            "新用户扫码登记为 S1 服务商，总部开通后生效",
          );
          await panel.getByRole("tab", { name: "S2 邀请码" }).click();
          await expect(panel.locator(".share-code")).toHaveText("WXYZ-6789");
          // An admin-made provider shows the account its bind code linked.
          await panel.getByRole("tab", { name: "服务商绑定码" }).click();
          await expect(panel.locator(".bound-owner")).toContainText(
            "华东负责人",
          );
          await expect(
            panel.getByRole("button", { name: "解除绑定" }),
          ).toBeVisible();
          await expect(panel).not.toContainText("名额");
          await panel.getByRole("tab", { name: "S1 邀请码" }).click();
        }
        if (width === 390) {
          const nativeButtons = await panel
            .locator(".mobile-record button")
            .evaluateAll((buttons) =>
              buttons
                .filter((b) => getComputedStyle(b).borderTopStyle !== "none")
                .map((b) => b.textContent),
            );
          expect(nativeButtons).toEqual([]);
        }
      }
      await page.screenshot({
        path: `../.runtime/provider-dialog-${width}-${index}.png`,
        animations: "disabled",
      });
      await dialog
        .getByRole("button", { name: "关闭", exact: true })
        .first()
        .click();
      await expect(dialog).toHaveCount(0);
    }
  }
});

test("provider function dialogs keep their record workflows", async ({
  page,
}) => {
  await row(page).getByRole("button", { name: "分享码", exact: true }).click();
  const share = page.getByRole("dialog", { name: "分享码", exact: true });
  await share.getByRole("tab", { name: "S2 邀请码" }).click();
  await share.getByRole("button", { name: "重置", exact: true }).click();
  const reset = page.getByRole("dialog", { name: "重置S2 邀请码？" });
  await expect(reset).toContainText("已登记的会员和服务商不受影响");
  await reset.getByRole("button", { name: "取消", exact: true }).click();
  await share
    .getByRole("button", { name: "关闭", exact: true })
    .first()
    .click();

  await row(page).getByRole("button", { name: "分佣", exact: true }).click();
  const commissions = page.getByRole("dialog", {
    name: "算力分佣",
    exact: true,
  });
  await commissions
    .getByRole("button", { name: "申请提现", exact: true })
    .click();
  const payout = page.getByRole("dialog", { name: "申请提现", exact: true });
  await expect(payout.getByLabel("提现金额（元）")).toBeVisible();
  await payout.getByRole("button", { name: "关闭", exact: true }).click();
});

test("a new provider's login comes prefilled with a generated account", async ({
  page,
}) => {
  await page.getByRole("button", { name: "新增分公司", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "新增分公司" }),
    account = dialog.getByLabel("账号", { exact: true }),
    password = dialog.getByLabel("初始密码");
  await expect(account).toHaveValue(/^sp\d{6}$/);
  await expect(password).toHaveValue(/^[A-Za-z2-9]{20}$/);
  // Both stay editable.
  await account.fill("own-account");
  await expect(account).toHaveValue("own-account");
});
