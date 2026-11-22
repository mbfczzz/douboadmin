import { expect, test } from "@playwright/test";
import { mockLogin } from "./mock-login";
import { confirmSubmission } from "./helpers";

for (const width of [1440, 390]) {
  test(`third party resource settings can be opened and saved at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockLogin(page);
    const names = {
      wechat: "微信登录",
      relay: "视频站点配置",
      sms: "短信验证码",
      oss: "阿里云 OSS",
      virtual: "微信虚拟支付",
      hot: "第三方资源配置",
      vision: "视频理解",
      chat: "对话模型",
      notifications: "完成订阅通知",
      site: "站点地址",
      alerts: "外部告警",
    };
    const fields = [
      { key: "TIKHUB_BASE_URL", label: "TikHub API 地址", kind: "url" },
      { key: "TIKHUB_API_KEY", label: "TikHub API Key", kind: "secret" },
      {
        key: "HOT_FEED_SOURCE",
        label: "创作页视频来源",
        kind: "select",
        options: [
          { value: "search", label: "关键词搜索" },
          { value: "billboard", label: "抖音视频热榜" },
        ],
      },
      { key: "HOT_FEED_KEYWORDS", label: "创作页关键词", kind: "text" },
      {
        key: "HOT_CACHE_FEED_MINUTES",
        label: "创作页视频流缓存（分钟）",
        kind: "text",
      },
      {
        key: "HOT_CACHE_SEARCH_MINUTES",
        label: "搜索结果缓存（分钟）",
        kind: "text",
      },
      {
        key: "HOT_CACHE_WORDS_MINUTES",
        label: "热门搜索词缓存（分钟）",
        kind: "text",
      },
      {
        key: "HOT_CACHE_VIDEO_MINUTES",
        label: "视频详情与链接解析缓存（分钟）",
        kind: "text",
      },
    ];
    let values: Record<string, string> = {
      TIKHUB_BASE_URL: "https://api.tikhub.io",
      TIKHUB_API_KEY: "",
      HOT_FEED_SOURCE: "search",
      HOT_FEED_KEYWORDS: "热门,剧情带货",
      HOT_CACHE_FEED_MINUTES: "1440",
      HOT_CACHE_SEARCH_MINUTES: "5",
      HOT_CACHE_WORDS_MINUTES: "10",
      HOT_CACHE_VIDEO_MINUTES: "30",
    };
    let version = 0;
    let submitted:
      | { version: number; values: Record<string, string>; clear: string[] }
      | undefined;
    await page.route("**/api/admin/platform", (route) =>
      route.fulfill({
        json: {
          capabilities: { hot: false },
          record: { id: "platform", version: 1, data: {} },
        },
      }),
    );
    await page.route("**/api/admin/integrations", (route) =>
      route.fulfill({
        json: {
          canManage: true,
          available: true,
          keyFile: "/fixture/integrations.key",
          groups: Object.entries(names).map(([id, name]) => ({
            id,
            name,
            hint: "保存后重启 API 和 Worker 生效。",
            fields: id === "hot" ? fields : [],
            values: id === "hot" ? values : {},
            secrets:
              id === "hot" ? { TIKHUB_API_KEY: !!values.TIKHUB_API_KEY } : {},
            version: id === "hot" ? version : 0,
            appliedVersion: 0,
            source: id === "hot" && version ? "database" : "environment",
            pendingRestart: id === "hot" && version > 0,
          })),
        },
      }),
    );
    await page.route("**/api/admin/integrations/hot", async (route) => {
      expect(route.request().method()).toBe("PUT");
      submitted = route.request().postDataJSON();
      values = { ...submitted!.values };
      version++;
      await route.fulfill({ json: { ok: true } });
    });
    if (width < 640)
      await page.getByRole("button", { name: "切换菜单", exact: true }).click();
    await page.getByRole("button", { name: "系统设置", exact: true }).click();
    const pill = page.getByRole("button", { name: /第三方资源配置.*未配置/ });
    await expect(page.locator("details.integration")).toHaveCount(11);
    await expect(pill).toBeVisible();
    await expect(page.locator(".integration-score")).toContainText(
      "0 / 11 已配置",
    );
    await pill.click();
    const card = page.locator("#integration-hot");
    await expect(card).toHaveAttribute("open", "");
    await expect(card.locator("summary .integration-icon svg")).toBeVisible();
    await expect(
      card.getByLabel("TikHub API 地址", { exact: true }),
    ).toHaveValue("https://api.tikhub.io");
    await page.screenshot({
      path: testInfo.outputPath("third-party-resources.png"),
      fullPage: true,
    });
    await card
      .getByLabel("TikHub API Key", { exact: true })
      .fill("fixture-resource-key");
    await card
      .getByLabel("创作页视频来源", { exact: true })
      .selectOption("billboard");
    await card
      .getByLabel("创作页关键词", { exact: true })
      .fill("剧情带货,探店");
    await card
      .getByLabel("创作页视频流缓存（分钟）", { exact: true })
      .fill("60");
    await card.getByRole("button", { name: "保存配置", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText(
      "确认修改第三方资源配置",
    );
    await expect(page.getByRole("dialog")).not.toContainText(
      "fixture-resource-key",
    );
    expect(submitted).toBeUndefined();
    await confirmSubmission(page);
    await expect(card.locator("summary")).toContainText("已保存 · 待重启");
    expect(submitted!.version).toBe(0);
    expect(submitted!.values).toMatchObject({
      TIKHUB_API_KEY: "fixture-resource-key",
      HOT_FEED_SOURCE: "billboard",
      HOT_CACHE_FEED_MINUTES: "60",
    });
    await card.getByLabel("创作页关键词", { exact: true }).fill("未保存");
    await card.getByRole("button", { name: "重新读取", exact: true }).click();
    await expect(card.getByLabel("创作页关键词", { exact: true })).toHaveValue(
      "剧情带货,探店",
    );
    expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
  });
}
