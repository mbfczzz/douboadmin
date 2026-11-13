const {test}=require("node:test");
const assert=require("node:assert/strict");
const {harness}=require("./harness.cjs");

test("task paging requests older server pages, not a local slice",async()=>{
 const h=harness();await h.api.signIn();const calls=[];
 h.wx.request=o=>{
  const url=new URL(o.url);calls.push(url);
  const page=Number(url.searchParams.get("page"));
  o.success({statusCode:200,data:{page,size:20,total:205,items:[{id:"job-"+page,status:"succeeded",input:{kind:"image",prompt:"sample"},createdAt:new Date().toISOString()}]}});
 };
 const page=h.page("tasks");await page.load();
 assert.equal(page.data.jobs[0].id,"job-1");
 page.setData({page:11});await page.load();
 assert.equal(page.data.total,205);assert.equal(page.data.jobs[0].id,"job-11");
 assert.equal(calls.at(-1).searchParams.get("excludeChat"),"true");
 page.next();assert.equal(page.data.page,11);
 page.previous();await new Promise(setImmediate);assert.equal(page.data.jobs[0].id,"job-10");
});

test("work kind filters reset the remote page and keep video-mix matching",async()=>{
 const h=harness();await h.api.signIn();const calls=[];
 h.wx.request=o=>{const url=new URL(o.url);calls.push(url);o.success({statusCode:200,data:{items:[],page:Number(url.searchParams.get("page")),total:40,size:20}});};
 const page=h.page("works");page.setData({page:2});await page.load();
 page.choose({currentTarget:{dataset:{value:"video"}}});await new Promise(setImmediate);
 assert.equal(calls.at(-1).searchParams.get("page"),"1");
 assert.equal(calls.at(-1).searchParams.get("kind"),"video");
 assert.equal(calls.at(-1).searchParams.get("works"),"true");
});

test("Mine requests three recent completed works (one row of covers) and preserves the full library link",async()=>{
 const h=harness();await h.api.signIn();let requested;
 h.api.request=async()=>({profile:{data:{nickname:"user"}},running:0});
 h.wx.request=o=>{requested=new URL(o.url);o.success({statusCode:200,data:{items:[],total:900,page:1,size:3}});};
 const page=h.page("mine");await page.load();
 assert.equal(requested.searchParams.get('size'),'3');
 assert.equal(requested.searchParams.get('works'),'true');
 page.menu({currentTarget:{dataset:{mode:'works'}}});
 assert.equal(h.nav.at(-1).url,'/pages/works/index');
 assert.equal(page.data.loading,false);
});
