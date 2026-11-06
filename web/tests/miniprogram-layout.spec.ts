import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

// Layout-only projection of the actual WXML/WXSS, not a WeChat runtime emulator.
const root = path.resolve("../miniprogram");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
function loop(page: string, variable: string) {
  const source = read(`pages/${page}/index.wxml`);
  const tags = /<(\/?)view\b[^>]*>/g;
  let start = -1,
    depth = 0;
  for (const tag of source.matchAll(tags)) {
    if (start < 0) {
      if (!tag[0].includes(`wx:for="{{${variable}}}"`)) continue;
      start = tag.index;
    }
    depth += tag[1] ? -1 : 1;
    if (!depth) return source.slice(start, tag.index + tag[0].length);
  }
  throw new Error(`Missing loop ${page}/${variable}`);
}
function html(source: string, values: Record<string, string>) {
  return source
    .replace(/{{([^}]+)}}/g, (_, key) => values[key] || "")
    .replace(
      /<(\/?)(view|text)\b/g,
      (_, close, tag) => `<${close}${tag === "view" ? "div" : "span"}`,
    );
}
function css(file: string, width: number): string {
  return read(file)
    .replace(/@import "([^"]+)";/g, (_, imported) =>
      css(path.join(path.dirname(file), imported), width),
    )
    .replace(/^page\s*{/gm, "body {")
    .replace(/\bview\b/g, "div")
    .replace(/(?<![\w.-])text\b(?=\s*[,>{:])/g, "span")
    .replace(/([\d.]+)rpx/g, (_, n) => `${(Number(n) * width) / 750}px`);
}
for (const width of [320, 375, 430]) {
  test(`mini-program record alignment at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const styles = [
      "styles/theme.wxss",
      "styles/common.wxss",
      "pages/wallet/index.wxss",
    ]
      .map((file) => css(file, width))
      .join("\n");
    const ledger = html(loop("wallet", "ledger"), {
      "item.title": "创作积分扣减",
      "item.note": "很长的任务说明以及连续编号" + "task0123456789".repeat(8),
      "item.time": "2026/11/06 12:30",
      "item.change": "-123456789.99",
    });
    const order = html(loop("orders", "rows"), {
      "item.points": "123456789",
      "item.state": "等待支付",
      "item.amount": "999999.99",
      "item.time": "2026/11/06 12:30",
      "item.id": "long-order-id-".repeat(8),
    });
    await page.setContent(
      `<style>body{margin:0}button:not([size=mini]){width:184px}${styles}</style><div class="subpage"><div class="biz-card">${ledger}</div>${order}</div>`,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    const amount = await page.locator(".ledger-change").boundingBox();
    const copy = await page.locator(".ledger-copy").boundingBox();
    expect(amount!.x).toBeGreaterThanOrEqual(copy!.x + copy!.width);
    expect(Math.abs(amount!.y - copy!.y)).toBeLessThan(1);
    const head = await page
      .locator(".biz-card-head > span")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().top),
      );
    expect(Math.abs(head[0] - head[1])).toBeLessThan(1);
    for (const button of await page.locator(".biz-pair button").all()) {
      expect(
        await button.evaluate(
          (el) =>
            el.getBoundingClientRect().width <=
            el.parentElement!.clientWidth + 1,
        ),
      ).toBe(true);
    }
    await page.screenshot({
      path: `../.runtime/mini-record-layout-${width}.png`,
      fullPage: true,
    });
  });
}
