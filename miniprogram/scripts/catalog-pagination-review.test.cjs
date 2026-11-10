const {test}=require("node:test");
const assert=require("node:assert/strict");
const {harness}=require("./harness.cjs");
const template=id=>({id,data:{title:id,cover:"/media/test.jpg"}});

test("template append keeps the submitted query when search input has changed",async()=>{
 const h=harness(),page=h.page("templates"),paths=[];
 h.api.request=async path=>{
  paths.push(path);
  return {items:path.includes("page=2")?[template("second")]:[template("first")],total:8};
 };
 page.setData({search:"原搜索"});
 await page.load();
 page.input({detail:{value:"未提交的新搜索"}});
 await page.load(true,true);
 assert.equal(new URL("http://fixture"+paths[1]).searchParams.get("q"),"原搜索");
 assert.equal(page.data.items.length,2);
 await page.load();
 assert.equal(new URL("http://fixture"+paths[2]).searchParams.get("q"),"未提交的新搜索");
 assert.equal(page.data.page,1);
});

test("template append deduplicates a shifted row and hidden pages discard late responses",async()=>{
 const h=harness(),page=h.page("templates");
 h.api.request=async()=>({items:[template("same")],total:8});
 await page.load();
 await page.load(true,true);
 assert.equal(page.data.items.length,1);
 assert.equal(page.data.page,2);
 let release;
 h.api.request=()=>new Promise(resolve=>{release=resolve});
 const pending=page.load();
 page.onHide();
 release({items:[template("late")],total:1});
 await pending;
 assert.equal(page.data.items[0].id,"same");
 assert.equal(page.fetching,false);
});

test("notifications hidden during read-all do not issue a follow-up list request",async()=>{
 const h=harness();await h.api.signIn();
 const page=h.page("notifications"),paths=[];
 let release;
 h.api.request=path=>{paths.push(path);return new Promise(resolve=>{release=resolve});};
 const pending=page.readAll();
 page.onHide();release({ok:true});await pending;
 assert.deepEqual(paths,["/notifications/read-all"]);
});

test("notification list ignores late hidden response and logout clears badge counts",async()=>{
 const h=harness();await h.api.signIn();
 const page=h.page("notifications");let release;
 h.api.request=()=>new Promise(resolve=>{release=resolve});
 const pending=page.load();page.onHide();
 release({items:[{id:"late",createdAt:"2026-11-10",data:{title:"late"}}],total:1,unread:1});
 await pending;assert.equal(page.data.items.length,0);
 h.storage.delete("douboSession");page.visible=true;
 page.setData({unread:20,total:20});await page.load();
 assert.equal(page.data.unread,0);assert.equal(page.data.total,0);
});
