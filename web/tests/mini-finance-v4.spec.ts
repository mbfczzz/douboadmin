import {test,expect} from '@playwright/test';
import {styles,glyph} from './reference-theme-mini';

for(const width of [320,390,430]) {
  test(`finance controls retain readable labels and touch targets at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:1000});
    const css=styles(width,['pages/orders/index.wxss','pages/wallet/index.wxss']);
    for(const count of [1,2,4]) {
      await page.setContent(css+`<div class="subpage"><div class="virtual-products ${count===1?'single':count===2?'pair':''}">${Array.from({length:count},(_,i)=>`<button class="virtual-product ${i===0?'selected':''}"><div class="row product-icons">${glyph('image')}${i===0?glyph('chevron-right'):''}</div><span class="product-points">99999<span class="product-unit">积分</span></span><span class="product-name">名称较长的真实积分套餐</span><span class="product-price">¥99.00</span></button>`).join('')}</div>
      <div class="biz-card order-card" style="margin-top:24px"><div class="order-values"><div><span class="biz-small">订单金额</span><span class="order-amount">¥999999.99</span></div><div><span class="biz-small">购买积分</span><span class="order-amount">123456789.99</span></div></div><div class="order-id"><span>订单号</span><span class="id-value">${'order-id-'.repeat(15)}</span>${glyph('image',16)}</div><div class="biz-pair"><div><button class="biz-action biz-secondary"><div class="button-content">${glyph('image',16)}<span>查支付结果</span></div></button></div><div><button class="biz-action"><div class="button-content">${glyph('image',16)}<span>继续支付</span></div></button></div></div></div></div>`);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
      for(const button of await page.locator('.order-card button').all()) {
        const size=await button.boundingBox();
        expect(size!.height).toBeGreaterThanOrEqual(44);
        expect(await button.locator('span').evaluate(n=>n.getBoundingClientRect().height)).toBeLessThan(24);
      }
      if(count===1)expect((await page.locator('.virtual-product').boundingBox())!.width).toBe(width-40);
    }
    await page.screenshot({path:`../.runtime/ui-v4-finance-${width}.png`,fullPage:true});
  });
}
