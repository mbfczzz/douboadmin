const {test}=require("node:test");
const assert=require("node:assert/strict");
const {harness}=require("./harness.cjs");

test("many pending orders stay below the API budget and stop when hidden",async(t)=>{
  let clock=0,serial=0,requests=0;
  const timers=new Map();
  const h=harness({setTimeout(fn,delay){const id=++serial;timers.set(id,{fn,at:clock+delay});return id;},clearTimeout(id){timers.delete(id);}});
  await h.api.signIn();
  const rows=Array.from({length:13},(_,i)=>({id:"pending-"+i,data:{userId:"wx-user",status:"created",amountFen:1000,pointsUnits:100000}}));
  h.storage.set("pending-payments",rows.map(row=>({id:row.id,owner:"wx-user"})));
  h.wx.request=options=>{
    requests++;
    const route=new URL(options.url).pathname.replace("/api","");
    options.success({statusCode:200,data:route==="/orders"?rows:rows.find(row=>route==="/orders/"+row.id||route.startsWith("/orders/"+row.id+"/"))});
  };
  const page=h.page("orders");page.visible=true;await page.load();
  while(timers.size){
    const [id,timer]=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];
    if(timer.at>=60000)break;
    clock=timer.at;timers.delete(id);timer.fn();await new Promise(setImmediate);
  }
  assert.ok(requests<=100,`unexpected first-minute request amplification: ${requests}`);
  assert.ok(requests>=13,"pending orders were never checked");
  t.diagnostic(JSON.stringify({pendingOrders:13,requestsDuringFirstMinute:requests}));
  page.onHide();
  assert.equal(timers.size,0);
});
