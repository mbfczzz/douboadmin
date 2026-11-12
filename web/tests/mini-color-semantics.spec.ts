import {test,expect} from '@playwright/test';
import {styles} from './reference-theme-mini';

test('business colors distinguish progress, completion, closure and unavailable actions',async({page})=>{
  await page.setViewportSize({width:760,height:850});
  await page.setContent(styles(390,['pages/wallet/index.wxss','pages/orders/index.wxss','pages/task-detail/index.wxss','pages/provider/index.wxss','styles/job-pagination.wxss'])+`<style>body{padding:24px}.sample{margin:16px 0;display:flex;gap:16px;align-items:center}.task-state{display:block}.biz-card{margin:20px 0}h2{font-size:18px}</style>
    <h2>充值订单</h2><div class="sample">${[['warning','待支付'],['running','确认到账中'],['succeeded','已支付'],['','已过期'],['running','退款处理中'],['','已退款']].map(([tone,label])=>`<span class="order-state pill ${tone}">${label}</span>`).join('')}</div>
    <h2>创作任务</h2><div class="sample">${[['queued','排队中'],['running','生成中'],['succeeded','已完成'],['failed','生成失败']].map(([s,label])=>`<div class="task-state ${s}"><span class="state-label">${label}</span></div>`).join('')}</div>
    <h2>服务商状态</h2><div class="sample"><span class="provider-off pill warning">待开通</span><span class="provider-off pill">已停用</span></div>
    <h2>暂不可用的操作</h2><div class="purchase-tabs"><button disabled>积分套餐</button><button>自定义金额</button></div><div class="virtual-products single"><button class="virtual-product selected" disabled><span>购买处理中，套餐不可切换</span></button></div><div class="job-pagination"><button disabled>上一页</button><button>下一页</button></div>
    <p>真实样式状态预览 · 非微信真机截图</p>`);
  const colors:Record<string,string>={'待支付':'rgb(138, 90, 0)','确认到账中':'rgb(11, 114, 105)','已支付':'rgb(21, 128, 61)','已过期':'rgb(102, 112, 133)','退款处理中':'rgb(11, 114, 105)','已退款':'rgb(102, 112, 133)','排队中':'rgb(138, 90, 0)','生成中':'rgb(11, 114, 105)','已完成':'rgb(21, 128, 61)','生成失败':'rgb(180, 35, 56)','待开通':'rgb(138, 90, 0)','已停用':'rgb(102, 112, 133)'};
  for(const [label,color] of Object.entries(colors))await expect(page.getByText(label,{exact:true})).toHaveCSS('color',color);
  await expect(page.locator('.purchase-tabs button[disabled]')).toHaveCSS('opacity','0.55');
  await expect(page.locator('.virtual-product[disabled]')).toHaveCSS('opacity','0.55');
  await expect(page.locator('.job-pagination button[disabled]')).toHaveCSS('background-color','rgb(233, 237, 242)');
  await page.screenshot({path:'../.runtime/color-semantic-review.png',fullPage:true});
});
