const {test}=require('node:test');
const assert=require('node:assert/strict');
const {harness}=require('./harness.cjs');

test('a failed recent-work request keeps account data and exposes retry',async()=>{
  const h=harness();await h.api.signIn();
  h.api.request=async()=>({profile:{data:{nickname:'真实用户'}},works:12,running:0,favorites:3});
  h.wx.request=o=>o.fail({errMsg:'offline'});
  const page=h.page('mine');await page.load();
  assert.equal(page.data.me.works,12);
  assert.equal(page.data.loading,false);
  assert.ok(page.data.worksError);
  page.onUnload();
});

test('recent previews exclude unfinished records and image failure does not break detail navigation',async()=>{
  const h=harness();await h.api.signIn();
  h.api.request=async()=>({profile:{data:{nickname:'用户'}},works:1,running:0,favorites:0});
  const job={id:'done',status:'succeeded',input:{kind:'video',prompt:'作品',assets:[]},thumbnailUrl:'https://fixture.test/cover.jpg',result:'https://fixture.test/video.mp4',createdAt:'2026-11-12'};
  h.wx.request=o=>o.success({statusCode:200,data:{items:[job,{...job,id:'pending',status:'running'}],page:1,size:2,total:1}});
  const page=h.page('mine');await page.load();
  assert.equal(page.data.jobs.length,1);
  assert.equal(page.data.jobs[0].thumbnailUrl,job.thumbnailUrl);
  page.coverError({currentTarget:{dataset:{id:'done'}}});
  page.detail({currentTarget:{dataset:{id:'done'}}});
  assert.equal(h.nav.at(-1).url,'/pages/task-detail/index?id=done');
  page.onUnload();
});
