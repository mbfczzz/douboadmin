import {expect,test} from "@playwright/test";
import {styles,header,glyph,tabs,source} from "./reference-theme-mini";

for(const width of [320,390,430]) {
  test(`mini surface boundaries and balance fit at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:980});
    await page.setContent(styles(width,["pages/mine/index.wxss","components/points-balance/index.wxss","custom-tab-bar/index.wxss"])+header("我的")+`
      <div class="page mine-page"><div class="mine-balance"><div class="balance"><div class="balance-copy"><span class="label">可用积分</span><span class="amount">99999.50</span></div><div class="balance-bottom"><span class="note">预留 2 积分</span><button class="action">我的积分</button></div></div></div>
      <span class="section-title common-heading">常用功能</span><div class="menu-grid">${["服务商中心","充值订单","我的收藏","生成记录","消息通知","帮助与反馈"].map(label=>`<div class="menu">${glyph("image")}<span class="menu-label">${label}</span></div>`).join("")}</div></div>${tabs()}`);
    await expect(page.locator(".balance")).toHaveCSS("background-color","rgb(36, 37, 43)");
    await expect(page.locator(".balance")).toHaveCSS("border-top-color","rgba(0, 0, 0, 0)");
    // The menu is a bare 3 × 2 grid of icon tiles, not a boxed card.
    await expect(page.locator(".menu-grid")).toHaveCSS("background-color","rgba(0, 0, 0, 0)");
    const cells=await Promise.all((await page.locator(".menu").all()).map(m=>m.boundingBox()));
    expect(new Set(cells.map(c=>Math.round(c!.x))).size).toBe(3);
    expect(new Set(cells.map(c=>Math.round(c!.y))).size).toBe(2);
    const balance=await page.locator(".balance").boundingBox(), button=await page.locator(".balance .action").boundingBox();
    expect(button!.x+button!.width).toBeLessThan(balance!.x+balance!.width);
    await expect(page.locator(".tabbar")).toHaveCSS("background-color","rgb(25, 26, 31)");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({path:`../.runtime/mini-boundaries-${width}.png`,fullPage:true});
  });
}

test('isolated native tab bar retains its colors without page variables',async({page})=>{
  await page.setContent(`<style>${source('custom-tab-bar/index.wxss')}</style><div class="tabbar"><div class="item"><span class="label">模板</span></div><div class="item primary"><div class="glyph">+</div><span class="label">创作</span></div><div class="item active"><div class="glyph">人</div><span class="label">我的</span></div></div>`);
  await expect(page.locator('.primary .glyph')).toHaveCSS('background-color','rgb(44, 44, 46)');
  await expect(page.locator('.primary .glyph')).toHaveCSS('color','rgb(255, 255, 255)');
  await expect(page.locator('.active')).toHaveCSS('color','rgb(255, 255, 255)');
  await expect(page.locator('.active .glyph')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await expect(page.locator('.item').first()).toHaveCSS('color','rgb(166, 168, 173)');
});
