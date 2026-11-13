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
    .replace(/(?<![\w.-])image\b/g, "img")
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
      "components/points-balance/index.wxss",
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
        <div class="workspace"><textarea class="prompt-input">第一行\n第二行\n第三行\n第四行</textarea><span class="count">500 / 500</span><div class="editor-meta"><div class="editor-balance"><div class="inline-balance"><span>可用 999999999.99 积分</span></div></div><div class="quote-note">预计 100 积分</div></div><div class="workspace-foot">
          <div class="model-select"><img class="model-logo" alt="" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" /><div class="model-copy"><span class="model-name">${long}</span></div><t-icon></t-icon></div>
          <button class="generate-button">生成</button></div>
        </div>
        <div class="resolution-options">${["720p", "1080p", "2160p", "4096×2160", "8192×4320", long].map((v) => `<div class="resolution-option">${v}</div>`).join("")}</div>
        <div class="model-option"><t-icon></t-icon><div class="model-info">${long}<span class="model-description">${long}</span><div class="model-badges"><span>高清</span><span>推荐</span></div></div><span class="model-estimate">123456789 积分</span><t-icon></t-icon></div>
        <div class="hero"><div class="hero-fav"></div><div class="hero-meta"><div class="hero-chips"><span class="chip">${long}</span><span class="chip">5 秒</span></div><span class="detail-title">${long}</span></div></div>
        <div class="slots" style="display:block;overflow-x:auto"><div class="slot-row"><div class="slot uploaded"><span class="slot-tag">主体图</span><div class="slot-remove"></div></div><div class="slot add required"><t-icon></t-icon><span class="slot-name">商品主体图</span><span class="slot-hint">正面清晰</span></div><div class="slot add optional"><t-icon></t-icon><span class="slot-name">宣传文案图</span><span class="slot-hint">选填</span></div></div></div>
        <div class="submit-bar" style="position:static"><div class="submit-copy"><span class="submit-quote">预计 123456789 积分</span><span class="submit-status">还需 1 张照片</span></div><button class="submit-action">生成同款</button></div>
      </div>`);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    for (const selector of [
      ".workspace-foot",
      ".resolution-options",
      ".model-option",
      ".hero-meta",
      ".submit-bar",
    ]) {
      expect(
        await page
          .locator(selector)
          .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        selector,
      ).toBe(true);
    }
    expect((await page.locator(".hero-fav").boundingBox())!.width).toBe(40);
    expect((await page.locator(".submit-action").boundingBox())!.width).toBe(148);
    expect((await page.locator(".model-select .model-logo").boundingBox())!.width).toBe(22);
    expect((await page.locator(".generate-button").boundingBox())!.width).toBe(
      width <= 350 ? 68 : 80,
    );
    const controls = await page.locator('.workspace-foot > *').evaluateAll(nodes => nodes.map(node => {
      const r=node.getBoundingClientRect();return {x:r.x,right:r.right,center:r.y+r.height/2};
    }));
    expect(controls).toHaveLength(2);
    const meta=await page.locator('.editor-meta').boundingBox();
    const foot=await page.locator('.workspace-foot').boundingBox();
    expect(meta!.y+meta!.height).toBeLessThan(foot!.y);
    const balance=await page.locator('.editor-balance').boundingBox();
    const count=await page.locator('.count').boundingBox();
    const prompt=await page.locator('.prompt-input').boundingBox();
    expect(prompt!.y+prompt!.height).toBeLessThanOrEqual(count!.y);
    const quote=await page.locator('.quote-note').boundingBox();
    expect(balance!.x+balance!.width).toBeLessThan(quote!.x);
    expect(count!.y+count!.height).toBeLessThan(meta!.y);
    for(let i=1;i<controls.length;i++){
      expect(controls[i].x-controls[i-1].right).toBeGreaterThanOrEqual(5);
      expect(Math.abs(controls[i].center-controls[0].center)).toBeLessThan(1);
    }
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
