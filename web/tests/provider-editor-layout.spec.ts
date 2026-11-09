import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";
import { surfaceFixtures, longName } from "./surface-fixtures";

test.beforeEach(async ({ page }) => {
  await login(page);
  await surfaceFixtures(page);
  await page.route("**/api/admin/quota-moves?*", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "move-1",
            version: 1,
            createdAt: "2026-11-06T00:50:00Z",
            data: {
              parentId: "root",
              childId: "qa-provider",
              users: 20,
              kind: "grant",
              reason: "初始可授权账号额度",
            },
          },
          {
            id: "move-2",
            version: 1,
            createdAt: "2026-11-06T00:51:00Z",
            data: {
              parentId: "qa-provider",
              childId: "qa-child",
              users: 4,
              kind: "grant",
              reason: "创建下级服务商并分配初始额度",
            },
          },
        ],
        page: 1,
        total: 2,
        size: 20,
      },
    }),
  );
  await page.getByRole("button", { name: "服务商管理", exact: true }).click();
});

const row = (page: Page) => page.locator(".provider-tree-row").first();
// Each row button opens one dialog with one job.
const functions = [
  ["编辑", "编辑服务商", ""],
  ["名额划拨", "名额划拨", "名额划拨记录"],
  ["授权码", "授权激活", "授权码"],
  ["分佣", "算力分佣", "佣金流水"],
] as const;

test("each provider function opens its own readable, contained dialog", async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [index, [button, title, heading]] of functions.entries()) {
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
        // Profile only: login, quotas and codes have their own buttons.
        await expect(dialog.getByText("登录账号")).toHaveCount(0);
      } else {
        const panel = dialog.locator(".provider-panel");
        await expect(
          panel.getByRole("heading", { name: heading, exact: true }),
        ).toBeVisible();
        await expect(panel.locator(".partner-records")).toHaveCount(2);
        const sections = await panel
          .locator(".partner-records")
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
          await expect(
            panel.getByText("质检子级服务商", { exact: true }),
          ).toBeVisible();
          await expect(
            panel.getByRole("region", { name: "名额申请", exact: true }),
          ).toContainText("审批说明");
        }
        if (index === 2)
          await expect(
            panel.getByLabel("查看全部服务商的授权码"),
          ).not.toBeChecked();
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
  await row(page)
    .getByRole("button", { name: "名额划拨", exact: true })
    .click();
  const quotas = page.getByRole("dialog", { name: "名额划拨", exact: true });
  const moves = quotas.getByRole("region", {
    name: "名额划拨记录",
    exact: true,
  });
  await moves.getByLabel("查询记录").fill("初始");
  const query = page.waitForRequest(
    (r) =>
      r.url().includes("/quota-moves?") &&
      new URL(r.url()).searchParams.get("q") === "初始",
  );
  await moves.getByRole("button", { name: "查询", exact: true }).click();
  await query;
  // Grant and reclaim are separate buttons with their own dialog.
  for (const name of ["划拨名额", "收回名额"]) {
    await quotas.getByRole("button", { name, exact: true }).click();
    const form = page.getByRole("dialog", { name, exact: true });
    await expect(
      form.getByRole("button", { name: "选择直接下级服务商" }),
    ).toBeVisible();
    await expect(form.getByLabel("操作")).toHaveCount(0);
    await form.getByRole("button", { name: "关闭", exact: true }).click();
  }
  await quotas
    .getByRole("button", { name: "关闭", exact: true })
    .first()
    .click();

  await row(page).getByRole("button", { name: "授权码", exact: true }).click();
  const codes = page.getByRole("dialog", { name: "授权激活", exact: true });
  await codes.getByRole("button", { name: "生成授权码", exact: true }).click();
  const code = page.getByRole("dialog", { name: "生成授权码", exact: true });
  await expect(code.getByLabel("激活码有效天数")).toHaveValue("7");
  await code.getByRole("button", { name: "关闭", exact: true }).click();
  await codes
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
