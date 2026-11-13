import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

// Project native layout boxes with their real WXSS. Native keyboard behavior
// remains a device check; these cases cover viewport and safe-area geometry.
function css(file: string, width: number, safe: number): string {
  return readFileSync(path.resolve("../miniprogram", file), "utf8")
    .replace(/@import "([^"]+)";/g, (_, name) => css(path.join(path.dirname(file), name), width, safe))
    .replace(/^page\s*{/gm, "body {")
    .replace(/(?<![\w.-])view\b/g, "div")
    .replace(/(?<![\w.-])text\b(?=\s*[,>{:])/g, "span")
    .replace(/([\d.]+)rpx/g, (_, n) => `${Number(n) * width / 750}px`)
    .replace(/env\(safe-area-inset-bottom\)/g, `${safe}px`);
}
const bar = `<div class="tabbar">${["模板", "混剪", "创作", "Agent", "我的"].map(name => `<div class="item"><div class="glyph">◇</div><span class="label">${name}</span></div>`).join("")}</div>`;
const devices = [
  { width: 320, height: 568, nav: 68, safe: 0 },
  { width: 393, height: 852, nav: 103, safe: 34 },
  { width: 430, height: 932, nav: 107, safe: 34 },
  { width: 844, height: 390, nav: 44, safe: 21 },
  { width: 390, height: 536, nav: 68, safe: 0 },
];
for (const d of devices) {
  const name = `${d.width}×${d.height}, safe ${d.safe}, nav ${d.nav}`;
  const styles = (pageFile: string) => `body{margin:0}button,textarea{font:inherit;border:0}textarea{resize:none;background:transparent;color:inherit}${[
    "styles/theme.wxss", "styles/common.wxss", pageFile, "custom-tab-bar/index.wxss",
  ].map(file => css(file, d.width, d.safe)).join("\n")}`;

  test(`mix action and final content clear the tab bar: ${name}`, async ({ page }) => {
    await page.setViewportSize(d);
    await page.setContent(`<style>${styles("pages/mix/index.wxss")}</style>
      <div style="height:${d.nav}px">混剪</div><div class="page mix-page">
      <div style="height:850px"></div><div class="biz-card sound-last"><span>声音</span><div style="height:120px"></div><span>背景音乐音量 · 20%</span></div>
      <div class="mix-submit"><span class="mix-summary">0 个素材 · 30 秒 · 9:16</span><button class="biz-action">开始混剪</button></div></div>${bar}`);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const submit = (await page.locator(".mix-submit").boundingBox())!;
    const button = (await page.locator(".mix-submit button").boundingBox())!;
    const tab = (await page.locator(".tabbar").boundingBox())!;
    const last = (await page.locator(".sound-last").boundingBox())!;
    expect(tab.y - button.y - button.height).toBeGreaterThanOrEqual(15);
    expect(submit.y + submit.height).toBeLessThanOrEqual(tab.y + .1);
    expect(last.y + last.height).toBeLessThan(submit.y - 12);
    expect(button.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(d.width);
    if (d.width === 393) await page.screenshot({ path: "../.runtime/mix-bottom-fixed.png" });
  });

  for (const state of ["empty", "messages", "multiline", "empty-multiline", "loading"] as const) {
    test(`Agent ${state} composer stays above navigation: ${name}`, async ({ page }) => {
      await page.setViewportSize(d);
      const empty = state.startsWith("empty"), multiline = state.includes("multiline"), loading = state === "loading";
      const history = loading
        ? '<div class="skeleton skel-bubble mine"></div><div class="skeleton skel-bubble"></div><div class="skeleton skel-bubble short"></div>'
        : empty
        ? `<div class="agent-empty"><div class="agent-hello"><div class="agent-mark">✦</div><span class="headline">让想法，再往前一步。</span><span class="intro-sub">从一个模糊的念头，到一份清晰的创作脚本。</span></div><div class="starters">${["帮我写一段产品短视频脚本", "为我的照片写创意提示词", "策划一个咖啡品牌宣传片"].map(text => `<div class="starter"><div class="starter-glyph"></div><div class="starter-copy"><span class="starter-title">${text}</span><span class="starter-hint">卖点 · 分镜 · 口播</span></div></div>`).join("")}</div></div>`
        : `<div class="conversation"><div style="height:900px"></div><div class="message">最后一条消息仍可滚动查看</div></div>`;
      await page.setContent(`<style>${styles("pages/agent/index.wxss")} .chat-scroll:not(.agent-skeleton){overflow-y:auto}</style>
        <div style="height:${d.nav}px">Agent</div><div class="agent-page" style="--nav-bottom:${d.nav}px">
        <div class="chat-scroll ${loading ? 'agent-skeleton' : ''}">${history}</div><div class="composer"><textarea style="height:${multiline ? 120 : 40}px" placeholder="说说你的创作想法…"></textarea>${multiline ? '<span class="composer-count">450/500</span>' : ''}<div class="send">↑</div></div></div>${bar}`);
      const tab = (await page.locator(".tabbar").boundingBox())!;
      const composer = (await page.locator(".composer").boundingBox())!;
      const send = (await page.locator(".send").boundingBox())!;
      const scroll = (await page.locator(".chat-scroll").boundingBox())!;
      expect(tab.y - composer.y - composer.height).toBeCloseTo(16, 0);
      expect(send.y + send.height).toBeLessThanOrEqual(composer.y + composer.height);
      expect(scroll.y + scroll.height).toBeLessThan(composer.y);
      if (multiline) {
        const count = (await page.locator(".composer-count").boundingBox())!;
        expect(count.y).toBeGreaterThanOrEqual(scroll.y + scroll.height);
        expect(count.y + count.height).toBeLessThanOrEqual(composer.y);
      }
      expect(composer.y).toBeGreaterThan(d.nav);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(d.width);
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(d.height);
      await page.locator(".chat-scroll").evaluate(el => { el.scrollTop = el.scrollHeight; });
      const final = (await page.locator(loading ? ".skel-bubble" : empty ? ".starter" : ".message").last().boundingBox())!;
      expect(final.y + final.height).toBeLessThanOrEqual(scroll.y + scroll.height + 1);
      if (d.width === 393 && state === "empty") await page.screenshot({ path: "../.runtime/agent-bottom-fixed.png" });
    });
  }
}
