import {expect,test} from "@playwright/test";
import {styles,header,glyph,tabs,source} from "./reference-theme-mini";

for(const width of [320,390,430]) {
  test(`mini surface boundaries and balance fit at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:980});
    await page.setContent(styles(width,["pages/mine/index.wxss","components/points-balance/index.wxss","custom-tab-bar/index.wxss"])+header("我的")+`
      <div class="page mine-page"><div class="mine-balance"><div class="balance"><div class="balance-copy"><span class="label">可用积分</span><span class="amount">99999.50</span></div><div class="balance-bottom"><span class="note">预留 2 积分</span><button class="action">我的积分</button></div></div></div>
      <span class="section-title common-heading">常用功能</span><div class="menu-grid">${["服务商中心","充值订单","我的收藏","生成记录","消息通知","帮助与反馈"].map(label=>`<div class="menu">${glyph("image")}<span class="menu-label">${label}</span></div>`).join("")}</div></div>${tabs()}`);
    for(const selector of [".balance",".menu-grid"]){
      await expect(page.locator(selector)).toHaveCSS("background-color",selector===".balance"?"rgb(36, 41, 48)":"rgb(28, 30, 34)");
      await expect(page.locator(selector)).toHaveCSS("border-top-width","1px");
      await expect(page.locator(selector)).toHaveCSS("border-top-color",selector===".balance"?"rgb(66, 75, 87)":"rgb(59, 62, 70)");
    }
    const balance=await page.locator(".balance").boundingBox(), button=await page.locator(".balance .action").boundingBox();
    expect(button!.x+button!.width).toBeLessThan(balance!.x+balance!.width);
    await expect(page.locator(".tabbar")).toHaveCSS("background-color","rgb(28, 30, 34)");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({path:`../.runtime/mini-boundaries-${width}.png`,fullPage:true});
  });
}

test('isolated native tab bar retains its colors without page variables',async({page})=>{
  await page.setContent(`<style>${source('custom-tab-bar/index.wxss')}</style><div class="tabbar"><div class="item"><span class="label">模板</span></div><div class="item primary"><div class="glyph">+</div><span class="label">创作</span></div><div class="item active"><div class="glyph">人</div><span class="label">我的</span></div></div>`);
  await expect(page.locator('.primary .glyph')).toHaveCSS('background-color','rgb(0, 200, 220)');
  await expect(page.locator('.primary .glyph')).toHaveCSS('color','rgb(8, 43, 48)');
  await expect(page.locator('.active')).toHaveCSS('color','rgb(244, 245, 247)');
  await expect(page.locator('.active .glyph')).toHaveCSS('background-color','rgb(23, 54, 59)');
  await expect(page.locator('.item').first()).toHaveCSS('color','rgb(166, 171, 181)');
});
