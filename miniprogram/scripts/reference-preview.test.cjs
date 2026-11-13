const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {harness}=require("./harness.cjs");
const tick=()=>new Promise(setImmediate);
const image={id:"ref-one",isImage:true,data:{url:"https://fixture.test/old?signature=expired",type:"image/png"}};

test("reference preview renews the private URL and opens the in-page viewer",async()=>{
  const h=harness(),page=h.page("create");
  const fresh="https://fixture.test/reference.png?signature=fresh";
  h.api.request=async path=>{
    assert.equal(path,"/assets/ref-one");
    return {...image,data:{...image.data,url:fresh}};
  };
  const second={id:"ref-two",isImage:true,data:{url:"https://fixture.test/two",type:"image/png"}};
  page.setData({prompt:"保留提示词",assets:[second,image]});
  page.previewReference({currentTarget:{dataset:{id:"ref-one"}}});
  await tick();
  assert.equal(page.data.viewerOpen,true);
  assert.equal(page.data.viewerIndex,1);
  assert.deepEqual(page.data.viewerItems.map(i=>[i.url,i.label]),[["https://fixture.test/two","图片1"],[fresh,"图片2"]]);
  assert.equal(page.data.prompt,"保留提示词");
  page.closeViewer();
  assert.equal(page.data.viewerOpen,false);
  const wxml=fs.readFileSync("pages/create/index.wxml","utf8");
  assert.match(wxml,/<image\s+wx:if="{{item.isImage}}"[^>]+bindtap="previewReference"/);
  assert.match(wxml,/class="reference-remove"[^>]+catchtap="remove"/);
});

test("a hidden reference preview cannot reopen after a quick return",async()=>{
  const h=harness(),page=h.page("create");
  page.setData({assets:[image]});
  let finish;
  h.api.request=()=>new Promise(resolve=>{finish=resolve;});
  page.previewReference({currentTarget:{dataset:{id:"ref-one"}}});
  page.onHide();
  page.visible=true;
  finish(image);
  await tick();
  assert.equal(page.data.viewerOpen,false);
});

test("preview taps share one lookup and a failed lookup stays retryable",async()=>{
  const h=harness(),page=h.page("create"),toasts=[];
  page.setData({assets:[image]});
  h.wx.showToast=o=>toasts.push(o);
  let finish,fail,reads=0;
  h.api.request=()=>{reads++;return new Promise((resolve,reject)=>{finish=resolve;fail=reject;});};
  const tap=()=>page.previewReference({currentTarget:{dataset:{id:"ref-one"}}});
  tap();tap();
  assert.equal(reads,1);
  fail(new Error("网络错误"));await tick();
  assert.equal(page.data.viewerOpen,false);
  tap();
  assert.equal(reads,2);
  page.onUnload();finish(image);await tick();
  assert.equal(page.data.viewerOpen,false);
});
