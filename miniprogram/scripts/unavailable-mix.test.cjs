const {test}=require("node:test");
const assert=require("node:assert/strict");
const {harness}=require("./harness.cjs");

test("unavailable mix cannot open file pickers or upload files",async()=>{
  const h=harness(),page=h.page("mix");
  let picks=0,uploads=0;
  h.wx.chooseMedia=async()=>{picks++;return {tempFiles:[]};};
  h.api.chooseReferenceFile=async()=>{picks++;return {path:"unused"};};
  h.api.upload=async()=>{uploads++;};
  page.setData({config:{enabled:false},script:"保留草稿"});
  await page.add();
  await page.uploadMusic();
  assert.equal(picks,0);
  assert.equal(uploads,0);
  assert.equal(page.data.script,"保留草稿");
});

test("unavailable-feature exits lead to creation",()=>{
  const h=harness(),calls=[];
  h.wx.switchTab=options=>calls.push(options.url);
  h.page("mix").create();
  h.page("hot-videos").upload();
  assert.deepEqual(calls,["/pages/create/index","/pages/create/index"]);
});

test("the full mix form works locally; only service actions say it is not open", async () => {
  const h = harness(),
    page = h.page("mix"),
    toasts = [];
  h.wx.showToast = (o) => toasts.push(o.title);
  page.setData({ config: { enabled: false, message: "混剪功能暂未开放" } });
  // Settings respond even while the service is closed.
  page.option({ currentTarget: { dataset: { field: "style", value: "rhythm" } } });
  page.flip({ currentTarget: { dataset: { field: "narration" } } });
  page.duration({ detail: { value: 45 } });
  assert.equal(page.data.style, "rhythm");
  assert.equal(page.data.narration, true);
  assert.equal(page.data.on.narration, true);
  assert.equal(page.data.keepOriginalAudio, false);
  assert.equal(page.data.duration, 45);
  page.flip({ currentTarget: { dataset: { field: "narration" } } });
  assert.equal(page.data.on.narration, false);
  // Adding files, uploading music and starting all explain instead.
  await page.add();
  await page.uploadMusic();
  await page.generate();
  assert.deepEqual([...toasts], ["混剪功能暂未开放", "混剪功能暂未开放", "混剪功能暂未开放"]);
});
