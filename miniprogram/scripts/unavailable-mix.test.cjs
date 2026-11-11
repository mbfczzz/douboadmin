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
