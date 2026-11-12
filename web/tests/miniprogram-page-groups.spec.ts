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
    const styles = ["styles/theme.wxss", "styles/common.wxss", "pages/create/menus.wxss", "pages/library/index.wxss"]
      .map((file) => css(file, width)).join("\n");
    const source = readFileSync(path.join(root, "pages/create/index.wxml"), "utf8");
    const sheet = source.slice(source.indexOf('<view wx:if="{{allowImage}}"'), source.lastIndexOf("</t-popup>"))
      .replace(/<t-icon\b[^>]*size="(\d+)"[^>]*\/>/g, (_, size) => `<view class="icon-root" style="width:${size}px;height:${size}px"></view>`)
      .replace(/{{[^}]+}}/g, "")
      .replace(/<(\/?)(view|text)\b/g, (_, close, tag) => `<${close}${tag === "view" ? "div" : "span"}`);
    await page.setContent(`<style>body{margin:0;font-family:sans-serif}.icon-root{flex-shrink:0}${styles}scroll-view{display:block}</style>
      <div class="reference-sheet">${sheet}
      <div class="favorite-card"><img alt="" /><div class="favorite-copy"><span>收藏的模板名称</span><span class="small">分类 · 制作同款</span></div><div class="icon-root" style="width:24px;height:24px"></div></div>
      <scroll-view class="model-menu is-open" style="position:relative;left:0;height:248px"></scroll-view>`);
    await expect(page.locator(".source-copy")).toHaveCount(3);
    for (const hint of await page.locator(".source-hint").all()) {
      expect((await hint.boundingBox())!.height).toBeLessThan(20);
    }
    for (const arrow of await page.locator(".source-option > .icon-root:last-child").all()) {
      expect((await arrow.boundingBox())!.width).toBe(18);
    }
    expect((await page.locator(".favorite-card > .icon-root").boundingBox())!.width).toBe(24);
    expect((await page.locator(".favorite-copy").boundingBox())!.width).toBeGreaterThan(100);
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
    for (let i = 0; i < fields.length; i++) {
      expect(fields[i].inputTop - fields[i].labelBottom).toBeCloseTo(8, 0);
      expect(fields[i].inputBottom - fields[i].inputTop).toBe(52);
      if (i)
        expect(fields[i].inputTop - fields[i - 1].inputBottom).toBeGreaterThanOrEqual(24);
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

  test(`real optional-material labels stay on one line at ${width}px`, async ({
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
    await page.setContent(
      `<style>body{margin:0;font-family:sans-serif}t-icon{display:block;flex-shrink:0}t-icon:first-child{width:18px;height:18px}t-icon:last-child{width:17px;height:17px}${styles}</style><div class="detail"><div class="optional-grid">${["场景照片", "品牌标识", "商品特写", "宣传文案图"].map((name) => `<div><t-icon></t-icon><span>${name}</span><t-icon></t-icon></div>`).join("")}</div></div>`,
    );
    const labels = await page
      .locator(".optional-grid span")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().height),
      );
    labels.forEach((height) => expect(height).toBeLessThanOrEqual(23));
    const cells = await page
      .locator(".optional-grid > div")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().top),
      );
    expect(cells[0] === cells[1]).toBe(width > 360);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    await page.screenshot({
      path: `../.runtime/mini-optional-groups-${width}.png`,
    });
  });
}
