const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {harness}=require("./harness.cjs");
const tick=()=>new Promise(setImmediate);
const image={id:"ref-one",isImage:true,data:{url:"https://fixture.test/old?signature=expired",type:"image/png"}};

test("reference preview renews the private URL and preserves the draft",async()=>{
  const h=harness(),page=h.page("create"),previews=[];
  h.wx.previewImage=options=>previews.push(options);
  const fresh="https://fixture.test/reference.png?signature=fresh";
  h.api.request=async path=>{
    assert.equal(path,"/assets/ref-one");
    return {...image,data:{...image.data,url:fresh}};
  };
  page.setData({prompt:"保留提示词",assets:[image]});
  const before=JSON.stringify(page.data);
  page.previewReference({currentTarget:{dataset:{id:"ref-one"}}});
  await tick();
  assert.equal(previews.length,1);
  assert.deepEqual(Array.from(previews[0].urls),[fresh]);
  assert.equal(JSON.stringify(page.data),before);
  const wxml=fs.readFileSync("pages/create/index.wxml","utf8");
  assert.match(wxml,/<image\s+wx:if="{{item.isImage}}"[^>]+bindtap="previewReference"/);
  assert.match(wxml,/class="reference-remove"[^>]+catchtap="remove"/);
});

test("a hidden reference preview cannot reopen after a quick return",async()=>{
  const h=harness(),page=h.page("create"),previews=[];
  page.setData({assets:[image]});
  h.wx.previewImage=o=>previews.push(o);
  let finish;
  h.api.request=()=>new Promise(resolve=>{finish=resolve;});
  page.previewReference({currentTarget:{dataset:{id:"ref-one"}}});
  page.onHide();
  page.visible=true;
  finish(image);
  await tick();
  assert.equal(previews.length,0);
});

test("preview taps share one lookup and native failure remains retryable",async()=>{
  const h=harness(),page=h.page("create"),previews=[],toasts=[];
  page.setData({assets:[image]});
  h.wx.previewImage=o=>previews.push(o);
  h.wx.showToast=o=>toasts.push(o);
  let finish,reads=0;
  h.api.request=()=>{reads++;return new Promise(resolve=>{finish=resolve;});};
  const tap=()=>page.previewReference({currentTarget:{dataset:{id:"ref-one"}}});
  tap();tap();
  assert.equal(reads,1);
  finish(image);await tick();
  previews[0].fail();previews[0].complete();
  assert.equal(toasts.length,1);
  tap();
  assert.equal(reads,2);
  page.onUnload();finish(image);await tick();
});
