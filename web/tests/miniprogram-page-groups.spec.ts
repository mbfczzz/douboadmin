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
    .replace(/(?<![\w.-])text\b(?=\s*[,>{:])/g, "span")
    .replace(/([\d.]+)rpx/g, (_, n) => `${(Number(n) * width) / 750}px`);
}
for (const width of [320, 375, 430]) {
  test(`profile grouping and work placeholders at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const markup = readFileSync(
      path.join(root, "pages/mine/index.wxml"),
      "utf8",
    );
    const form = markup
      .slice(
        markup.indexOf('<form bindsubmit="save">'),
        markup.indexOf("</form>") + 7,
      )
      .replace(/\s(?:disabled|loading)="[^"]*"/g, "")
      .replace(/{{[^}]+}}/g, "")
      .replace(
        /<(\/?)(view|text)\b/g,
        (_, close, tag) => `<${close}${tag === "view" ? "div" : "span"}`,
      );
    const styles = [
      "styles/theme.wxss",
      "styles/common.wxss",
      "pages/mine/index.wxss",
    ]
      .map((file) => css(file, width))
      .join("\n");
    await page.setContent(
      `<style>body{margin:0}t-icon{display:block;width:32px;height:32px;background:#9bcbaa55}${styles}</style><div class="sheet">${form}<div class="works"><div class="work"><div class="work-cover"><div class="work-placeholder"><t-icon></t-icon></div><span class="work-state">已完成</span></div></div></div></div>`,
    );
    const fields = await page.locator(".profile-field").evaluateAll((nodes) =>
      nodes.map((node) => {
        const label = node
          .querySelector(".field-label")!
          .getBoundingClientRect();
        const input = node.querySelector("input")!.getBoundingClientRect();
        return {
          top: label.top,
          inputTop: input.top,
          inputBottom: input.bottom,
          labelBottom: label.bottom,
        };
      }),
    );
    for (let i = 0; i < fields.length; i++) {
      expect(fields[i].inputTop - fields[i].labelBottom).toBeCloseTo(8, 0);
      if (i)
        expect(fields[i].top - fields[i - 1].inputBottom).toBeCloseTo(20, 0);
    }
    const icon = await page.locator(".work-placeholder t-icon").boundingBox();
    const cover = await page.locator(".work-cover").boundingBox();
    const state = await page.locator(".work-state").boundingBox();
    expect(icon!.y).toBeGreaterThan(state!.y + state!.height);
    expect(icon!.x + icon!.width / 2).toBeCloseTo(
      cover!.x + cover!.width / 2,
      0,
    );
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
