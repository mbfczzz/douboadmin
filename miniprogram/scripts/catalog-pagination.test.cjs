const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

test("templates fetch the next page and reset server search without duplicate loading", async () => {
  const h = harness(), page = h.page("templates"), calls = [];
  h.api.request = async path => {
    calls.push(path);
    const q = new URL(path, "https://fixture").searchParams;
    const p = Number(q.get("page"));
    return { items: Array.from({length:p===1?4:1},(_,i)=>({id:`${p}-${i}`,data:{cover:"/test.jpg"}})), total:5 };
  };
  await page.load();
  assert.equal(page.data.items.length,4);
  page.more(); page.more();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,2);
  assert.equal(page.data.items.length,5);
  assert.match(calls[1],/page=2/);
  page.setData({search:"old"});
  await page.load();
  assert.equal(page.data.page,1);
  assert.equal(page.data.items.length,4);
  assert.match(calls.at(-1),/q=old/);
});

test("notification pagination appends rows while keeping global unread count", async () => {
  const h=harness();await h.api.signIn();
  const page=h.page("notifications");
  h.api.request=async path=>({items:[{id:path.includes("page=2")?"old":"new",createdAt:"2026-11-10",data:{title:"notice"}}],total:2,unread:521});
  await page.load();await page.load(true);
  assert.equal(page.data.items.length,2);
  assert.equal(page.data.unread,521);
  assert.equal(page.data.page,2);
});
