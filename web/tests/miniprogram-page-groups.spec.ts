import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

// Browser projection verifies layout relationships, not native WeChat rendering.
const root = path.resolve("../miniprogram");
function css(file: string, width: number): string {
  return readFileSync(path.join(root, file), "utf8")
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
  test(`virtual-host icons leave room for source and favorite text at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const styles = ["styles/theme.wxss", "styles/common.wxss", "styles/sheets.wxss", "pages/create/menus.wxss", "pages/library/index.wxss"]
      .map((file) => css(file, width)).join("\n");
    const source = readFileSync(path.join(root, "pages/create/parts/sheets.wxml"), "utf8");
    const start = source.indexOf('<view class="source-grid">');
    const sheet = source.slice(start, source.indexOf('<text class="source-note">', start))
      .replace(/<t-icon\b[^>]*size="(\d+)"[^>]*\/>/g, (_, size) => `<view class="icon-root" style="width:${size}px;height:${size}px"></view>`)
      .replace(/{{[^}]+}}/g, "")
      .replace(/<(\/?)(view|text)\b/g, (_, close, tag) => `<${close}${tag === "view" ? "div" : "span"}`);
    await page.setContent(`<style>body{margin:0;font-family:sans-serif}.icon-root{flex-shrink:0}${styles}scroll-view{display:block}</style>
      <div class="reference-sheet">${sheet}
      <div class="favorite-grid"><div class="favorite-card"><img alt="" /><div class="favorite-heart"></div><div class="favorite-copy"><span class="favorite-title">收藏的模板名称收藏的模板名称收藏的模板名称</span><span class="favorite-go">人物写真 · 做同款 ›</span></div></div><div class="favorite-card"></div></div>
      <scroll-view class="model-menu is-open" style="position:relative;left:0;height:248px"></scroll-view>`);
    await expect(page.locator(".source-tile")).toHaveCount(3);
    for (const hint of await page.locator(".source-hint").all()) {
      expect((await hint.boundingBox())!.height).toBeLessThan(20);
    }
    for (const glyph of await page.locator(".source-glyph > .icon-root").all()) {
      expect((await glyph.boundingBox())!.width).toBe(26);
    }
    // Two cover cards per row; a long title clamps to two lines inside the card.
    const cards = await Promise.all((await page.locator(".favorite-card").all()).map((c) => c.boundingBox()));
    expect(Math.round(cards[0]!.y)).toBe(Math.round(cards[1]!.y));
    expect((await page.locator(".favorite-title").boundingBox())!.height).toBeLessThanOrEqual(41);
    const menu = (await page.locator(".model-menu").boundingBox())!;
    expect(menu.width).toBe(248);
    expect(menu.height).toBe(248);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });

  test(`profile labels and read-only fields at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const markup = readFileSync(
      path.join(root, "pages/profile/index.wxml"),
      "utf8",
    );
    const form = markup
      .slice(
        markup.indexOf("<form "),
        markup.indexOf("</form>") + 7,
      )
      .replace(/\s(?:disabled|loading)="[^"]*"/g, "")
      .replace(/{{[^}]+}}/g, "")
      .replace(/<textarea\b([^>]*)\/>/g, "<textarea$1></textarea>")
      .replace(/<(\/?)image\b/g, "<$1img")
      .replace(
        /<(\/?)(view|text)\b/g,
        (_, close, tag) => `<${close}${tag === "view" ? "div" : "span"}`,
      );
    const styles = [
      "styles/theme.wxss",
      "styles/common.wxss",
      "pages/profile/index.wxss",
    ]
      .map((file) => css(file, width))
      .join("\n");
    await page.setContent(
      `<style>body{margin:0}input,textarea{background:transparent;border:0;font:inherit}t-icon{display:block;width:20px;height:20px;flex-shrink:0}${styles}</style><div class="subpage profile-page">${form}</div>`,
    );
    await expect(page.locator(".profile-field:has(input)")).toHaveCount(2);
    const fields = await page.locator(".profile-field:has(input)").evaluateAll((nodes) =>
      nodes.map((node) => {
        const labelNode = node.querySelector(".profile-label")!;
        const label = labelNode.getBoundingClientRect();
        const labelStyle = getComputedStyle(labelNode);
        const input = node.querySelector("input")!.getBoundingClientRect();
        return {
          top: label.top,
          inputTop: input.top,
          inputBottom: input.bottom,
          labelBottom: label.bottom,
          labelRight: label.right,
          inputLeft: input.left,
          labelCenter: label.top + parseFloat(labelStyle.paddingTop) + parseFloat(labelStyle.lineHeight) / 2,
        };
      }),
    );
    // Inline rows: label left, value right, centred on one 56px line.
    for (let i = 0; i < fields.length; i++) {
      const labelMid = (fields[i].top + fields[i].labelBottom) / 2,
        inputMid = (fields[i].inputTop + fields[i].inputBottom) / 2;
      expect(Math.abs(labelMid - inputMid)).toBeLessThan(2);
      expect(fields[i].inputLeft).toBeGreaterThanOrEqual(fields[i].labelRight);
      expect(fields[i].inputBottom - fields[i].inputTop).toBe(56);
      if (i) expect(fields[i].inputTop - fields[i - 1].inputBottom).toBeLessThan(4);
    }
    await expect(page.locator(".profile-readonly-fields input")).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    await page.screenshot({
      path: `../.runtime/mini-profile-groups-${width}.png`,
      fullPage: true,
    });
  });

  test(`upload slots keep labels on one line in a single row at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 700 });
    const styles = [
      "styles/theme.wxss",
      "styles/common.wxss",
      "pages/template-detail/index.wxss",
    ]
      .map((file) => css(file, width))
      .join("\n");
    const names = ["商品主体图", "场景照片", "品牌标识", "商品特写", "宣传文案图"];
    await page.setContent(
      `<style>body{margin:0;font-family:sans-serif}t-icon{display:block;flex-shrink:0;width:20px;height:20px}${styles}</style><div class="detail"><div class="slots" style="display:block;overflow-x:auto"><div class="slot-row">${names.map((name, i) => `<div class="slot add ${i ? "optional" : "required"}"><t-icon></t-icon><span class="slot-name">${name}</span><span class="slot-hint">选填</span></div>`).join("")}</div></div></div>`,
    );
    const labels = await page
      .locator(".slot-name")
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
    labels.forEach((height) => expect(height).toBeLessThanOrEqual(20));
    const tops = await page
      .locator(".slot")
      .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: `../.runtime/mini-upload-slots-${width}.png` });
  });
}
