import { expect, test } from "@playwright/test";
import { mockLogin } from "./mock-login";
import { creator, header, image, materialSheet, styles } from "./reference-theme-mini";

for (const width of [320, 390, 430]) {
  test(`reference mini creator, model menu and material popup at ${width}px`, async ({page}) => {
    await page.setViewportSize({width,height:844});
    await page.setContent(styles(width,["pages/create/index.wxss","custom-tab-bar/index.wxss"])+creator());
    await expect(page.locator(".generate-button")).toHaveCSS("background-color","rgb(250, 250, 250)");
    await expect(page.locator(".generate-button")).toHaveCSS("color","rgb(16, 17, 19)");
    expect(await page.locator(".item.active").evaluate(e=>getComputedStyle(e).backgroundImage)).toContain("linear-gradient");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({path:`../.runtime/reference-theme/mini-create-${width}.png`});
    await page.locator(".workspace").evaluate((element, logo) => {
      const menu=document.createElement("scroll-view");
      menu.className="model-menu is-open";
      menu.style.height="210px";
      menu.innerHTML=["Seedance 2.0 Fast VIP","Seedance 2.0 Mini","Seedance 2.0 VIP","Seedance 2.5"].map((label,i)=>`<div class="model-option ${i===0?"selected":""}"><img class="model-logo" src="${logo}" alt=""/><div class="model-info"><div class="model-title"><span>${label}</span></div></div>${i===0?"✓":""}</div>`).join("");
      element.append(menu);
    },image("model-icons/bytedance.png"));
    await expect(page.locator(".model-option.selected")).toHaveCSS("background-color","rgb(45, 47, 52)");
    await page.screenshot({path:`../.runtime/reference-theme/mini-models-${width}.png`});
    await page.locator("body").evaluate((body, content) => {
      const overlay=document.createElement("div");
      overlay.style.cssText="position:fixed;inset:0;background:#0009;display:flex;align-items:flex-end;z-index:2000";
      overlay.innerHTML=`<div class="reference-sheet" style="width:100%;background:var(--ui-surface);border-radius:14px 14px 0 0"><div class="reference-heading"><span>添加参考素材</span><div class="close-sheet">×</div></div>${content}</div>`;
      body.append(overlay);
    },materialSheet());
    expect((await page.locator(".source-copy").first().boundingBox())!.width).toBeGreaterThan(170);
    await page.screenshot({path:`../.runtime/reference-theme/mini-materials-${width}.png`});
  });
}

for (const width of [320,390]) {
  test(`reference mini forms, balances and status colors at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:844});
    await page.setContent(styles(width,["pages/profile/index.wxss","pages/wallet/index.wxss","pages/orders/index.wxss"])+header("我的积分")+`<div class="subpage">
      <div class="biz-card"><span class="biz-label">可用积分</span><span class="biz-value">200</span><div class="row wallet-links"><span class="biz-small">预留积分 10 · 刷新</span><span class="biz-link">充值订单 ›</span></div></div>
      <div class="biz-card"><span class="biz-heading">购买积分</span><span class="biz-label">充值金额（元）</span><input class="biz-input" aria-label="充值金额" placeholder="输入充值金额"/><span class="biz-note">1 元约 10 积分</span><button class="biz-action">购买积分</button><button class="biz-action" disabled>充值暂未开放</button></div>
      <div class="biz-card"><span class="biz-heading">积分流水</span><div class="biz-row"><span>积分充值</span><span class="ledger-change plus">+100</span></div><div class="biz-row"><span>图片创作</span><span>−2</span></div></div>
      <div class="biz-error">余额暂时无法更新 · 点击重试</div><span class="order-state paid">已支付</span><span class="order-state created">待支付</span>
      </div>`);
    await expect(page.locator(".order-state.paid")).toHaveCSS("color","rgb(50, 212, 122)");
    await expect(page.getByRole("button",{name:"充值暂未开放"})).toHaveCSS("background-color","rgb(41, 43, 48)");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({path:`../.runtime/reference-theme/mini-wallet-${width}.png`,fullPage:true});
  });
}

for (const width of [1440,390]) {
  test(`reference admin entry at ${width}px`, async ({page}) => {
    await page.setViewportSize({width,height:1000});
    await page.route("**/api/**", route => {
      const endpoint=new URL(route.request().url()).pathname;
      if(endpoint==="/api/brand-icon") return route.fulfill({contentType:"image/png",body:Buffer.from(image("brand/doubo.png").split(",")[1],"base64")});
      return route.fulfill({status:endpoint==="/api/admin/me"?401:200,json:endpoint==="/api/config"?{models:[],categories:[],demo:false}:{}});
    });
    await page.goto("/");
    await expect(page.getByRole("button",{name:"登录管理台"})).toBeVisible();
    await expect(page.locator(".login-form .primary")).toHaveCSS("background-color","rgb(225, 11, 114)");
    expect(await page.locator(".project-logo").evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);
    await page.screenshot({path:`../.runtime/reference-theme/admin-login-${width}.png`,fullPage:true});
  });

  test(`reference admin login, records and detail dialog at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:1000});
    await page.route("**/media/brand/doubo.png",r=>r.fulfill({contentType:"image/png",body:Buffer.from(image("brand/doubo.png").split(",")[1],"base64")}));
    const job={id:"theme-verification",userId:"fixture",status:"succeeded",progress:100,input:{kind:"image",prompt:"窗边的产品摄影",model:"image-model",resolution:"2k",ratio:"1:1",assets:[]},modelName:"图像模型",result:image("brand/doubo.png"),createdAt:"2026-11-11T10:00:00Z",updatedAt:"2026-11-11T10:00:30Z",billingState:"charged",costUnits:200};
    await mockLogin(page);
    await page.route(/\/api\/admin\/jobs\?/,r=>r.fulfill({json:{items:[job],total:1,page:1,size:20}}));
    await page.route("**/api/admin/jobs/theme-verification/detail",r=>r.fulfill({json:{job,inputs:[],execution:null,calls:[],polls:0,morePolls:false}}));
    if(width<640) await page.getByRole("button",{name:"切换菜单",exact:true}).click();
    await page.getByRole("button",{name:"生成任务",exact:true}).click();
    await expect(page.getByText("窗边的产品摄影",{exact:true})).toBeVisible();
    expect(await page.locator("nav button.active").evaluate(e=>getComputedStyle(e).backgroundImage)).toContain("linear-gradient");
    await page.screenshot({path:`../.runtime/reference-theme/admin-records-${width}.png`,fullPage:true});
    await page.getByRole("button",{name:/详情/}).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading",{name:"生成记录详情"})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({path:`../.runtime/reference-theme/admin-detail-${width}.png`,fullPage:true});
  });
}
