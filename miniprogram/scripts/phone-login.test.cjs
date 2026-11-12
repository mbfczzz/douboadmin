const {test}=require('node:test');
const assert=require('node:assert/strict');
const {harness}=require('./harness.cjs');

test('phone authorization sends distinct login and phone codes without storing the grant',async()=>{
  const h=harness();
  await h.api.signIn('wechat','phone-grant');
  assert.equal(h.sent[0].data.code,'fresh-code-1');
  assert.equal(h.sent[0].data.phoneCode,'phone-grant');
  assert.equal(h.api.hasSession(),true);
  assert.ok(!JSON.stringify([...h.storage.values()]).includes('phone-grant'));
});

test('denied native authorization sends nothing and the manual login remains available',async()=>{
  const h=harness();
  const page=h.page('login');
  let finished=0;page.finish=async()=>{finished++};
  await page.phoneLogin({detail:{errMsg:'getPhoneNumber:fail user deny'}});
  assert.equal(h.sent.length,0);
  assert.equal(finished,0);
  await page.wechat();
  assert.equal(finished,1);
  assert.equal(h.sent[0].data.phoneCode,undefined);
  page.destroyed=true;
  await page.phoneLogin({detail:{code:'late-grant'}});
  assert.equal(h.sent.length,1);
});

test('a phone grant joins only the matching concurrent login',async()=>{
  const h=harness();let release;
  h.wx.login=()=>new Promise(resolve=>{release=resolve});
  const first=h.api.signIn('wechat','one-use-grant');
  await assert.rejects(h.api.signIn('wechat','other-grant'),/等待/);
  release({code:'session-code'});await first;
  assert.equal(h.sent.length,1);
  assert.equal(h.sent[0].data.phoneCode,'one-use-grant');
});

test('a server-verified phone needs only name completion, not another SMS',async()=>{
  const h=harness();const page=h.page('activate');
  page.setData({logged:true,name:'用户',phone:'13900139000',status:{profileRequired:true,phoneVerified:true,smsRequired:false}});
  let body;h.api.request=async(path,method,data)=>{body=data;return {profileRequired:false,active:false}};
  await page.register();
  assert.equal(body.phone,'13900139000');
  assert.equal(body.code,undefined);
});
