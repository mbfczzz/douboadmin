import {expect,test} from "@playwright/test";
import {styles,header,glyph,tabs} from "./reference-theme-mini";

for(const width of [320,390,430]) {
  test(`mini surface boundaries and balance fit at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:980});
    await page.setContent(styles(width,["pages/mine/index.wxss","components/points-balance/index.wxss","custom-tab-bar/index.wxss"])+header("我的")+`
      <div class="page mine-page"><div class="mine-balance"><div class="balance"><div class="balance-copy"><span class="label">可用积分</span><span class="amount">9994</span><span class="note">预留 2 积分</span></div><button class="action">微信充值</button></div></div>
      <span class="section-title common-heading">常用功能</span><div class="menu-list">${["服务商中心","我的积分","充值订单","我的收藏","生成记录","消息通知","帮助与反馈","设置"].map(label=>`<div class="menu">${glyph("image")}<span>${label}</span>${glyph("chevron-right")}</div>`).join("")}</div></div>${tabs()}`);
    for(const selector of [".balance",".menu-list"]){
      await expect(page.locator(selector)).toHaveCSS("background-color","rgb(255, 255, 255)");
      await expect(page.locator(selector)).toHaveCSS("border-top-width","1px");
      await expect(page.locator(selector)).toHaveCSS("border-top-color","rgb(215, 222, 230)");
    }
    const balance=await page.locator(".balance").boundingBox(), button=await page.locator(".balance .action").boundingBox();
    expect(button!.x+button!.width).toBeLessThan(balance!.x+balance!.width);
    await expect(page.locator(".tabbar")).toHaveCSS("background-color","rgb(255, 255, 255)");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({path:`../.runtime/mini-boundaries-${width}.png`,fullPage:true});
  });
}
