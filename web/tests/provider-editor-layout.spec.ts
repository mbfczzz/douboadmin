import { expect, test } from "@playwright/test";
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
  await page.getByRole("button", { name: "编辑", exact: true }).first().click();
  await expect(
    page.getByRole("dialog", { name: "编辑服务商", exact: true }),
  ).toBeVisible();
});

test("all provider editor tabs are grouped, readable and contained", async ({
  page,
}) => {
  const editor = page.getByRole("dialog", { name: "编辑服务商", exact: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [index, name] of [
      "基本信息",
      "名额划拨",
      "授权激活",
      "算力分佣",
    ].entries()) {
      await editor.getByRole("tab", { name, exact: true }).click();
      const panel = editor.getByRole("tabpanel");
      await expect(panel).toBeVisible();
      if (index === 0) {
        await expect(panel.getByLabel("服务商名称")).toHaveValue(longName);
        await expect(
          panel.getByRole("button", { name: "保存服务商" }),
        ).toBeEnabled();
      } else {
        await expect(
          panel.getByRole("heading", {
            name: ["", "名额划拨记录", "授权码", "佣金流水"][index],
            exact: true,
          }),
        ).toBeVisible();
        await expect(panel.locator(".partner-records")).toHaveCount(2);
        await expect(panel.locator(".catalog-pagination")).toHaveCount(2);
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
      }
      if (index === 1) {
        await expect(
          panel.getByText("质检子级服务商", { exact: true }),
        ).toBeVisible();
        await expect(panel.getByText("平台", { exact: true })).toBeVisible();
        await expect(
          panel.getByRole("region", { name: "名额申请", exact: true }),
        ).toContainText("审批说明");
      }
      if (index === 2) {
        await expect(
          panel.getByLabel("查看全部服务商的授权码"),
        ).not.toBeChecked();
      }
      expect(
        await panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      ).toBe(true);
      if (width === 390) {
        const nativeButtons = await panel
          .locator(".mobile-record button")
          .evaluateAll((buttons) =>
            buttons
              .filter(
                (button) => getComputedStyle(button).borderTopStyle !== "none",
              )
              .map((button) => button.textContent),
          );
        expect(nativeButtons).toEqual([]);
      }
      await panel.evaluate((el) => {
        el.scrollTop = 0;
      });
      await page.screenshot({
        path: `../.runtime/provider-editor-${width}-${index}.png`,
        animations: "disabled",
      });
    }
  }
});

test("tabs support keyboard navigation and record actions keep their original workflow", async ({
  page,
}) => {
  const editor = page.getByRole("dialog", { name: "编辑服务商", exact: true });
  await editor.getByRole("tab", { name: "基本信息", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    editor.getByRole("tab", { name: "名额划拨", exact: true }),
  ).toBeFocused();
  const moves = editor.getByRole("region", {
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
  await moves
    .getByRole("button", { name: "划拨 / 收回名额", exact: true })
    .click();
  const form = page.getByRole("dialog", {
    name: "名额划拨 / 收回",
    exact: true,
  });
  await expect(
    form.getByRole("button", { name: "选择直接下级服务商" }),
  ).toBeVisible();
  await form.getByRole("button", { name: "关闭", exact: true }).click();
  await editor.getByRole("tab", { name: "授权激活", exact: true }).click();
  await editor.getByRole("button", { name: "生成授权码", exact: true }).click();
  const code = page.getByRole("dialog", { name: "生成授权码", exact: true });
  await expect(code.getByLabel("激活码有效天数")).toHaveValue("7");
  await code.getByRole("button", { name: "关闭", exact: true }).click();
  await editor.getByRole("tab", { name: "算力分佣", exact: true }).click();
  await editor.getByRole("button", { name: "申请提现", exact: true }).click();
  const payout = page.getByRole("dialog", { name: "申请提现", exact: true });
  await expect(payout.getByLabel("提现金额（元）")).toBeVisible();
  await payout.getByRole("button", { name: "关闭", exact: true }).click();
});
