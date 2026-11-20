import {test,expect} from '@playwright/test';
import {styles,glyph} from './reference-theme-mini';

for(const width of [320,390,430]) {
  test(`finance controls retain readable labels and touch targets at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:1000});
    const css=styles(width,['pages/orders/index.wxss','pages/wallet/index.wxss']);
    for(const count of [1,2,4]) {
      // The current wallet and order markup (pages/wallet, pages/orders).
      await page.setContent(css+`<div class="subpage"><div class="virtual-products ${count===1?'single':count===2||count===4?'pair':''}">${Array.from({length:count},(_,i)=>`<button class="virtual-product ${i===0?'selected':''}"><div class="product-top">${i===0?'<span class="product-badge">最划算</span>':''}</div><div class="product-body"><div class="product-figure">${glyph('image',16)}<span class="product-points">230,000</span></div><span class="product-price">¥999.00</span><span class="product-rate">约 ¥0.43/百积分</span></div></button>`).join('')}</div>
      <div class="order-card" style="margin-top:24px"><div class="order-head"><div class="order-art"></div><div class="order-title"><span class="order-points">123456789.99 积分</span><span class="biz-small">名称较长的真实积分套餐 · 2026/11/06 12:30</span></div><div class="order-side"><span class="order-amount">¥999999.99</span><span class="order-state pill">等待支付</span></div></div><div class="order-id"><span>订单号</span><span class="id-value">${'order-id-'.repeat(15)}</span>${glyph('image',14)}</div><div class="order-actions"><span class="order-check">查支付结果</span><button class="order-pay">继续支付</button></div></div></div>`);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
      // Points and price are never cut off inside a product.
      for (const value of await page.locator('.product-points, .product-price').all())
        expect(await value.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      for(const button of await page.locator('.order-card button').all()) {
        const size=await button.boundingBox();
        expect(size!.height).toBeGreaterThanOrEqual(44);
        // The label stays on one line.
        expect(await button.evaluate(b=>{const r=document.createRange();r.selectNodeContents(b);return r.getClientRects().length;})).toBe(1);
      }
      if(count===1)expect((await page.locator('.virtual-product').boundingBox())!.width).toBe(width-40);
    }
    await page.screenshot({path:`../.runtime/ui-v4-finance-${width}.png`,fullPage:true});
  });
}
