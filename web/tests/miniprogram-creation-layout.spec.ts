import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

// CSS layout contracts only; native components still need WeChat preview QA.
function css(file: string, width: number): string {
  return readFileSync(path.resolve("../miniprogram", file), "utf8")
    .replace(/@import "([^"]+)";/g, (_, source) =>
      css(path.join(path.dirname(file), source), width),
    )
    .replace(/(^|\n)page\s*{/g, "$1body {")
    .replace(/\bview\b/g, "div")
    .replace(/(?<![\w.-])text\b(?=\s*[,>{:])/g, "span")
    .replace(/([\d.]+)rpx/g, (_, n) => `${(Number(n) * width) / 750}px`);
}
for (const width of [320, 375, 430]) {
  test(`creation controls and asset details fit ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const styles = [
      "styles/theme.wxss",
      "styles/common.wxss",
      "pages/create/settings.wxss",
      "pages/create/workspace.wxss",
      "pages/create/menus.wxss",
      "pages/template-detail/index.wxss",
    ]
      .map((file) => css(file, width))
      .join("\n");
    const long = "LongModelNameWithoutSpaces".repeat(5);
    await page.setContent(`<style>body{margin:0;font-family:sans-serif}t-icon{display:block;width:16px;height:16px}${styles}</style>
      <div style="padding:20px">
        <div class="workspace"><div class="workspace-foot">
          <div class="model-select"><t-icon></t-icon><span class="model-name">${long}</span><t-icon></t-icon></div>
          <span class="spec">4096×2160 · 120秒</span><button class="generate-button">生成</button>
        </div></div>
        <div class="resolution-options">${["720p", "1080p", "2160p", "4096×2160", "8192×4320", long].map((v) => `<div class="resolution-option">${v}</div>`).join("")}</div>
        <div class="model-option"><t-icon></t-icon><div class="model-info">${long}<span class="model-description">${long}</span><div class="model-badges"><span>高清</span><span>推荐</span></div></div><span class="model-estimate">123456789 积分</span><t-icon></t-icon></div>
        <div class="row title-row"><span class="detail-title">${long}</span><div class="favorite"></div></div>
        <div class="required-upload"><div class="upload-icon"></div><div><span class="upload-name">${long}</span><span class="upload-hint">长文件说明</span><div class="upload-text">上传照片</div></div><span class="required">必填</span></div>
        <div class="optional-grid"><div><t-icon></t-icon><span>${long}</span><t-icon></t-icon></div><div><t-icon></t-icon><span>参考照片</span><t-icon></t-icon></div></div>
        <div class="uploaded"><image></image><div class="uploaded-copy"><span>${long}.png</span></div><div class="delete"><t-icon></t-icon></div></div>
      </div>`);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    for (const selector of [
      ".workspace-foot",
      ".resolution-options",
      ".model-option",
      ".required-upload",
      ".optional-grid",
      ".uploaded",
    ]) {
      expect(
        await page
          .locator(selector)
          .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        selector,
      ).toBe(true);
    }
    expect((await page.locator(".favorite").boundingBox())!.width).toBe(28);
    expect((await page.locator(".generate-button").boundingBox())!.width).toBe(
      78,
    );
    await page.screenshot({
      path: `../.runtime/mini-creation-layout-${width}.png`,
      fullPage: true,
    });
  });
}

for (const height of [568, 844]) {
  test(`model dropdown remains scrollable on a ${height}px screen`, async ({
    page,
  }) => {
    const width = 320,
      up = height === 568,
      menuHeight = up ? 280 : 320;
    await page.setViewportSize({ width, height });
    const styles = [
      "styles/theme.wxss",
      "pages/create/workspace.wxss",
      "pages/create/menus.wxss",
    ]
      .map((file) => css(file, width))
      .join("\n");
    const rows = Array.from(
      { length: 20 },
      (_, i) =>
        `<div class="model-option"><div class="model-info"><span>模型 ${i + 1}</span><span class="model-description">用于验证模型列表滚动的说明</span></div><span class="model-estimate">10 积分</span></div>`,
    ).join("");
    await page.setContent(
      `<style>body{margin:0;font-family:sans-serif}scroll-view{display:block;overflow-y:auto}${styles}</style><div style="padding:120px 20px 0"><div class="workspace"><scroll-view class="model-menu is-open ${up ? "menu-up" : ""}" style="height:${menuHeight}px">${rows}</scroll-view></div></div>`,
    );
    const menu = page.locator(".model-menu");
    const bounds = await menu.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
    expect(await menu.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
      true,
    );
    await menu.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(menu.getByText("模型 20", { exact: true })).toBeInViewport();
    await page.screenshot({ path: `../.runtime/mini-menu-${height}.png` });
  });
}
