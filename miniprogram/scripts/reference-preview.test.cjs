const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {harness}=require("./harness.cjs");

test("tapping an uploaded reference opens native full-screen preview without changing the draft",()=>{
  const h=harness(),page=h.page("create"),previews=[];
  h.wx.previewImage=options=>previews.push(options);
  page.setData({prompt:"保留提示词",assets:[{id:"ref-one",isImage:true,data:{url:"https://fixture.test/reference.png?signature=private",type:"image/png"}}]});
  const before=JSON.stringify(page.data);
  page.previewReference({currentTarget:{dataset:{url:page.data.assets[0].data.url}}});
  assert.equal(previews.length,1);
  assert.deepEqual(Array.from(previews[0].urls),[page.data.assets[0].data.url]);
  assert.equal(JSON.stringify(page.data),before);
  const wxml=fs.readFileSync("pages/create/index.wxml","utf8");
  assert.match(wxml,/<image\s+wx:if="{{item.isImage}}"[^>]+bindtap="previewReference"/);
  assert.match(wxml,/class="reference-remove"[^>]+catchtap="remove"/);
});
