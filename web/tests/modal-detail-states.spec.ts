import { expect, test } from "@playwright/test";
import { login } from "./helpers";
import { modalPartnerFixtures } from "./modal-partner-fixtures";
import { inspectModal, closeTop } from "./modal-audit";

const samples = [
  {
    module: ["授权码", "授权激活"],
    button: "查看二维码",
    path: "/activation-codes/qa-code",
    loaded: "复制激活码",
  },
  {
    module: ["授权码", "授权激活"],
    button: "来源记录",
    path: "/activation-codes/qa-code/trace",
    loaded: "生成账号",
  },
  {
    module: ["分佣", "算力分佣"],
    button: "qa-order",
    path: "/orders/qa-order/distribution",
    loaded: "分佣对象",
  },
];
for (const sample of samples) {
  test(`${sample.button}: loading, error and retry stay inside the child dialog`, async ({
    page,
  }) => {
    await login(page);
    await modalPartnerFixtures(page);
    await page.getByRole("button", { name: "服务商管理", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .locator(".provider-tree-row")
      .first()
      .getByRole("button", { name: sample.module[0], exact: true })
      .click();
    let fail = true,
      release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**/api/admin${sample.path}`, async (route) => {
      if (!fail) return route.fallback();
      await pending;
      await route.fulfill({
        status: 503,
        json: { error: "测试网络故障，请重试" },
      });
    });
    await page
      .getByRole("button", { name: sample.button, exact: true })
      .click();
    const child = page.getByRole("dialog").last();
    try {
      await expect(
        child.getByRole("status", { name: "正在加载" }),
      ).toBeVisible();
      await inspectModal(page, `390-${sample.button}-loading`);
    } finally {
      release();
    }
    await expect(child.getByRole("alert")).toContainText("测试网络故障");
    await inspectModal(page, `390-${sample.button}-error`);
    fail = false;
    await child.getByRole("button", { name: "重试", exact: true }).click();
    await expect(child.getByText(sample.loaded, { exact: true })).toBeVisible();
    await closeTop(page);
    await expect(
      page.getByRole("dialog", { name: sample.module[1], exact: true }),
    ).toBeVisible();
  });
}
