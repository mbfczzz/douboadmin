import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

function css(file: string, width: number, safe: number): string {
  return readFileSync(path.resolve("../miniprogram", file), "utf8")
    .replace(/@import "([^"]+)";/g, (_, source) =>
      css(path.join(path.dirname(file), source), width, safe),
    )
    .replace(/^page\s*{/gm, "body {")
    .replace(/(?<![\w.-])view\b/g, "div")
    .replace(/(?<![\w.-])image\b/g, "img")
    .replace(/(?<![\w.-])text\b(?=\s*[,>{:])/g, "span")
    .replace(/([\d.]+)rpx/g, (_, n) => `${(Number(n) * width) / 750}px`)
    .replace(/env\(safe-area-inset-bottom\)/g, `${safe}px`);
}

for (const device of [
  { width: 320, height: 568, safe: 0 },
  { width: 393, height: 852, safe: 34 },
  { width: 430, height: 932, safe: 34 },
]) {
  test(`featured grid and pagination stay aligned at ${device.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(device);
    const styles = [
      "styles/theme.wxss",
      "styles/common.wxss",
      "components/featured-works/index.wxss",
      "custom-tab-bar/index.wxss",
    ]
      .map((file) => css(file, device.width, device.safe))
      .join("\n");
    const cards = Array.from(
      { length: 20 },
      (_, index) => `<div class="featured-card">
        <div class="featured-cover"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="><span class="featured-badge">视频</span></div>
        <span class="featured-title">${index ? "短标题" : "这是一个用于验证单行省略的很长作品标题"}</span>
      </div>`,
    ).join("");
    const tabs = ["模板", "优秀", "创作", "Agent", "我的"]
      .map((name) => `<div class="item"><div class="glyph">◇</div><span class="label">${name}</span></div>`)
      .join("");
    await page.setContent(`<style>body{margin:0}button{border:0}img{display:block}${styles}</style>
      <div style="height:100px"></div><div class="featured-page">
        <div class="featured-filters"><div class="featured-tab active">全部</div><div class="featured-tab">图片</div><div class="featured-tab">视频</div></div>
        <div class="featured-grid">${cards}</div>
        <div class="job-pagination"><button disabled>上一页</button><span>第 1 页 · 共 23 个</span><button>下一页</button></div>
      </div><div class="tabbar">${tabs}</div>`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
      device.width,
    );
    const cardBounds = await page.locator(".featured-card").evaluateAll((nodes) =>
      nodes.slice(0, 2).map((node) => node.getBoundingClientRect().toJSON()),
    );
    expect(cardBounds).toHaveLength(2);
    expect(Math.abs(cardBounds[0].width - cardBounds[1].width)).toBeLessThan(1);
    expect(cardBounds[1].x).toBeGreaterThan(cardBounds[0].x + cardBounds[0].width);
    const title = page.locator(".featured-title").first();
    expect(await title.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const pagination = (await page.locator(".job-pagination").boundingBox())!;
    const previous = (await page.getByRole("button", { name: "上一页" }).boundingBox())!;
    const count = (await page.getByText("第 1 页 · 共 23 个", { exact: true }).boundingBox())!;
    const next = (await page.getByRole("button", { name: "下一页" }).boundingBox())!;
    const tabbar = (await page.locator(".tabbar").boundingBox())!;
    expect(previous.x + previous.width).toBeLessThan(count.x);
    expect(count.x + count.width).toBeLessThan(next.x);
    expect(Math.abs(previous.y + previous.height / 2 - next.y - next.height / 2)).toBeLessThan(1);
    expect(previous.width).toBeLessThan(device.width / 3);
    expect(next.width).toBeLessThan(device.width / 3);
    expect(pagination.y + pagination.height).toBeLessThanOrEqual(tabbar.y - 20);
    expect(await page.locator(".featured-page").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    if (device.width === 393)
      await page.screenshot({ path: "../.runtime/featured-layout-fixed.png", fullPage: true });
  });
}
