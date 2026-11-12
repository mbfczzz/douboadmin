const {test}=require('node:test');
const assert=require('node:assert/strict');
const {harness}=require('./harness.cjs');

test('order colors follow the displayed state, including pending payment after expiry',async()=>{
  const h=harness();await h.api.signIn();
  const record=(id,status,expired=false)=>({id,createdAt:new Date().toISOString(),data:{userId:'wx-user',status,amountFen:10,pointsUnits:1000,expiresAt:new Date(Date.now()+(expired?-60000:60000)).toISOString()}});
  const rows=[record('waiting','created'),record('expired','created',true),record('confirming','created',true),record('paid','paid'),record('refund','refunding'),record('refunded','refunded'),record('closed','closed')];
  h.service('payment-status').rememberPayment('confirming','wx-user');
  h.api.request=async()=>({items:rows,total:rows.length,page:1,size:20});
  const page=h.page('orders');await page.load();
  const expected={waiting:['待支付','warning',true],expired:['已过期','',false],confirming:['确认到账中','running',false],paid:['已支付','succeeded',false],refund:['退款处理中','running',false],refunded:['已退款','',false],closed:['已关闭','',false]};
  for(const row of page.data.rows)assert.deepEqual([row.state,row.tone,row.canPay],expected[row.id],row.id);
  page.onUnload();
});
