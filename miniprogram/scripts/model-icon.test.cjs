const {test}=require("node:test");
const assert=require("node:assert/strict");
const {harness}=require("./harness.cjs");

test("model menu accepts relative HTTPS and HTTP brand icons without exposing URLs as glyph text",async()=>{
  const h=harness(),page=h.page("create");
  const icons=["/media/model-icons/bytedance.png","https://fixture.test/minimax.png","http://fixture.test/openai.png",undefined,"字"];
  h.api.request=async()=>({models:icons.map((icon,i)=>({id:"model-"+i,name:"模型"+i,kind:"video",icon,resolutions:["720p"],ratios:["16:9"],durations:[5],modes:["t2v"]}))});
  await page.loadModels();
  const rows=page.data.availableModels;
  assert.match(rows[0].iconURL,/\/media\/model-icons\/bytedance\.png$/);
  assert.equal(rows[1].iconURL,icons[1]);
  assert.equal(rows[2].iconURL,icons[2]);
  assert.equal(rows[2].icon,"");
  assert.equal(rows[3].iconURL,"");
  assert.equal(rows[4].icon,"字");
  const patches=[];page.setData=v=>patches.push(v);
  page.hideModelIcon({currentTarget:{dataset:{id:"model-2",url:icons[2]}}});
  assert.equal(patches[0]["availableModels[2].iconURL"],"");
  assert.equal(patches[0]["availableModels[2].icon"],"");
  page.hideModelIcon({currentTarget:{dataset:{id:"old-model"}}});
  assert.equal(patches.length,1,"late error must not clear a different model icon");
});

test("an old image failure cannot clear a refreshed OSS URL for the same model",async()=>{
  const h=harness(),page=h.page("create");
  let icon="https://icons.test/openai.png?signature=old";
  h.api.request=async()=>({models:[{id:"model",name:"GPT",kind:"video",icon,resolutions:["720p"],ratios:["16:9"],durations:[5],modes:["t2v"]}]});
  await page.loadModels();
  const old=icon;
  icon="https://icons.test/openai.png?signature=new";
  await page.loadModels();
  const patches=[];page.setData=v=>patches.push(v);
  page.hideModelIcon({currentTarget:{dataset:{id:"model",url:old}}});
  assert.equal(patches.length,0,"late failure cleared the refreshed icon");
  page.hideModelIcon({currentTarget:{dataset:{id:"model",url:icon}}});
  assert.equal(patches[0]["availableModels[0].iconURL"],"");
});

test("model menu preserves the complete private OSS HTTPS signature",async()=>{
  const h=harness(),page=h.page("create");
  const icon="https://fixture-bucket.oss-cn-shanghai.aliyuncs.com/system/model-icons/hash/openai.png?x-oss-signature-version=OSS4-HMAC-SHA256&x-oss-credential=fixture%2Foss&x-oss-expires=86400&x-oss-signature=fixture";
  h.api.request=async()=>({models:[{id:"image",name:"GPT Image",kind:"image",icon,resolutions:["1K"],ratios:["1:1"],modes:["t2i"]}]});
  page.data.kind="image";
  await page.loadModels();
  assert.equal(page.data.availableModels[0].iconURL,icon);
  assert.equal(page.data.availableModels[0].icon,"");
});
