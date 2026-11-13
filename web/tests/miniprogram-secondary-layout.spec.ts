import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

// Layout projections use source styles; they do not emulate native components.
function css(file: string, width: number): string {
  return readFileSync(path.resolve("../miniprogram", file), "utf8")
    .replace(/@import "([^"]+)";/g, (_, name) =>
      css(path.join(path.dirname(file), name), width),
    )
    .replace(/^page\s*{/gm, "body {")
    .replace(/(?<![\w.-])view\b/g, "div")
    .replace(/(?<![\w.-])image\b/g, "img")
    .replace(/(?<![\w.-])text\b(?=\s*[,>{:])/g, "span")
    .replace(/([\d.]+)rpx/g, (_, n) => `${(Number(n) * width) / 750}px`);
}

for (const width of [320, 375, 430]) {
  test(`search, metadata and activation sections fit ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const styles = [
      "styles/theme.wxss",
      "styles/common.wxss",
      "pages/hot-videos/index.wxss",
      "pages/activate/index.wxss",
      "pages/library/index.wxss",
    ]
      .map((file) => css(file, width))
      .join("\n");
    await page.setContent(`<style>body{margin:0;font-family:sans-serif}${styles}</style><div class="subpage">
      <div class="hot-search"><input class="biz-input" placeholder="搜索抖音视频关键词"><button class="biz-action">搜索</button></div>
      <div class="biz-card"><div class="row biz-title-row"><span class="biz-heading">最近搜索</span><span class="biz-link">清空</span></div><div class="row biz-note"><span>点赞 123.4万</span><span>播放 999.9万</span></div></div>
      <div class="favorite-grid"><div class="favorite-card"><img style="object-fit:cover" alt=""><div class="favorite-copy"><span class="favorite-title">这是一个比较长的收藏模板标题，需要保持封面和文字位置稳定</span><span class="favorite-go">作品分类 · 做同款 ›</span></div></div><div class="favorite-card"></div></div>
      <div class="biz-card activation-options"><div class="activation-path"><span class="biz-heading">扫码登记</span><span class="biz-note">扫码登记对应角色，上级开通后生效</span><button class="biz-action">扫码登记</button><div class="activation-sms"><input class="biz-input" placeholder="或输入 8 位码"><button class="biz-action biz-secondary">确认登记</button></div></div></div>
    </div>`);
    const input = await page.locator(".hot-search input").boundingBox();
    const button = await page.locator(".hot-search button").boundingBox();
    expect(input!.width).toBeGreaterThan(160);
    expect(button!.width).toBeLessThan(100);
    expect(input!.x + input!.width).toBeLessThanOrEqual(button!.x);
    expect(
      await page
        .locator(".row.biz-note")
        .evaluate((el) => getComputedStyle(el).display),
    ).toBe("flex");
    const title = await page
      .locator(".biz-title-row .biz-heading")
      .boundingBox();
    const action = await page.locator(".biz-title-row .biz-link").boundingBox();
    expect(title!.y + title!.height / 2).toBeCloseTo(
      action!.y + action!.height / 2,
      0,
    );
    // The favorite cover fills its card.
    const card = (await page.locator(".favorite-card").first().boundingBox())!;
    expect((await page.locator(".favorite-card img").boundingBox())!.width).toBeCloseTo(card.width, 0);
    // The typed code and its confirm button share one row.
    const code = await page.locator(".activation-sms input").boundingBox(),
      confirm = await page.locator(".activation-sms button").boundingBox();
    expect(code!.y).toBe(confirm!.y);
    expect(code!.x + code!.width).toBeLessThan(confirm!.x);
    expect(code!.width).toBeGreaterThan(120);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    await page.screenshot({
      path: `../.runtime/mini-secondary-${width}.png`,
      fullPage: true,
    });
  });

  test(`designed selection markers are visible at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 700 });
    const styles = [
      "styles/theme.wxss",
      "styles/common.wxss",
      "pages/create/index.wxss",
      "custom-tab-bar/index.wxss",
    ]
      .map((file) => css(file, width))
      .join("\n");
    await page.setContent(
      `<style>body{margin:0;font-family:sans-serif}${styles}</style><div class="create-page"><div class="mode-tabs"><div class="mode-tab active">生成视频</div><div class="mode-tab">生成图片</div></div></div><div class="tabbar">${["模板", "混剪", "创作", "Agent", "我的"].map((name, i) => `<div class="item ${i === 2 ? "active" : ""}"><div class="glyph"><t-icon>◇</t-icon></div><span class="label">${name}</span></div>`).join("")}</div>`,
    );
    expect((await page.locator(".mode-tabs").boundingBox())!.height).toBe(44);
    // The selected mode is a white text tab (no fill); the selected tab white.
    const look = (selector: string) =>
      page.locator(selector).first().evaluate((el) => ({
        background: getComputedStyle(el).backgroundColor,
        color: getComputedStyle(el).color,
      }));
    expect(await look(".mode-tab.active")).toEqual({
      background: "rgba(0, 0, 0, 0)",
      color: "rgb(255, 255, 255)",
    });
    expect((await look(".item.active")).color).toBe("rgb(255, 255, 255)");
    expect((await look(".item:not(.active)")).color).toBe("rgb(166, 168, 173)");
    expect((await page.locator(".item.active").boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `../.runtime/mini-selection-${width}.png` });
  });
}
