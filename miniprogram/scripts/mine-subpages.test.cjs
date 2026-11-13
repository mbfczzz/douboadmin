const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

test("help questions open in place, one at a time", () => {
  const page = harness().page("library");
  assert.equal(page.data.faqs.length, 3);
  assert.equal(page.data.faqOpen, 0);
  const tap = (index) => page.faq({ currentTarget: { dataset: { index } } });
  tap(2);
  assert.equal(page.data.faqOpen, 2);
  tap(2);
  assert.equal(page.data.faqOpen, -1);
});

test("lists group by 今天 / 昨天 / date, one heading per day", () => {
  const h = harness();
  const { dayLabel, withDays } = h.service("../utils/day");
  const now = new Date("2026-11-13T12:00:00");
  assert.equal(dayLabel("2026-11-13T08:00:00", now), "今天");
  assert.equal(dayLabel("2026-11-12T23:59:00", now), "昨天");
  assert.equal(dayLabel("2026-11-02T10:00:00", now), "11月2日");
  const today = new Date().toISOString();
  const rows = withDays([{ createdAt: today }, { createdAt: today }, { createdAt: "2026-01-02T10:00:00" }]);
  assert.deepEqual([...rows].map((r) => r.showDay), [true, false, true]);
});

test("settings reads the real version and opens help and privacy", () => {
  const h = harness();
  h.wx.getAccountInfoSync = () => ({ miniProgram: { version: "1.4.2", envVersion: "release" } });
  const page = h.page("preferences");
  page.onLoad();
  assert.equal(page.data.version, "v1.4.2");
  h.wx.getAccountInfoSync = () => ({ miniProgram: { version: "", envVersion: "trial" } });
  page.onLoad();
  assert.equal(page.data.version, "体验版");
  let opened = 0;
  h.wx.openPrivacyContract = () => opened++;
  page.privacy();
  assert.equal(opened, 1);
});

test("long-pressing a favorite confirms, switches it off and drops the card", async () => {
  const h = harness(),
    page = h.page("library"),
    calls = [];
  page.setData({ templates: [{ id: "t1", data: { title: "海边" } }, { id: "t2", data: { title: "街头" } }] });
  h.wx.showModal = async () => ({ confirm: false });
  h.wx.showToast = () => {};
  h.api.request = async (path, method, body) => {
    calls.push([path, method || "GET", body && body.active]);
    return method === "PUT" ? {} : { version: 3, data: { active: true } };
  };
  await page.unfavorite({ currentTarget: { dataset: { id: "t1" } } });
  assert.equal(calls.length, 0); // kept
  h.wx.showModal = async () => ({ confirm: true });
  await page.unfavorite({ currentTarget: { dataset: { id: "t1" } } });
  assert.deepEqual(calls, [["/favorites/t1", "GET", undefined], ["/favorites/t1", "PUT", false]]);
  assert.deepEqual([...page.data.templates].map((t) => t.id), ["t2"]);
});

test("unfinished tasks show their own first reference image, looked up once", async () => {
  const h = harness();
  await h.api.signIn();
  const { loadRefs } = h.service("../pages/tasks/refs");
  let calls = 0;
  h.wx.request = (o) => {
    calls++;
    const id = o.url.split("/assets/")[1];
    o.success({ statusCode: 200, data: { id, data: { url: "https://cdn.test/" + id + ".jpg", type: id === "v1" ? "video/mp4" : "image/png" } } });
  };
  const page = { data: { refs: {}, ongoing: [{ id: "j1", input: { assets: ["a1"] } }, { id: "j2", input: { assets: ["v1"] } }, { id: "j3", input: { assets: [] } }] }, setData(v) { Object.assign(this.data, v); } };
  await loadRefs(page);
  assert.equal(page.data.refs.j1, "https://cdn.test/a1.jpg");
  assert.equal(page.data.refs.j2, ""); // a video reference keeps the status tile
  assert.equal("j3" in page.data.refs, false);
  await loadRefs(page); // polling again does not refetch
  assert.equal(calls, 2);
});

test("task counters filter the list and unfinished tasks say how long they've run", () => {
  const h = harness();
  const { elapsed, nextFilter } = h.service("../pages/tasks/view");
  const now = Date.parse("2026-11-13T10:00:00Z");
  assert.equal(elapsed("2026-11-13T09:59:40Z", "running", now), "已进行 不到 1 分钟");
  assert.equal(elapsed("2026-11-13T09:57:00Z", "queued", now), "已排队 3 分钟");
  assert.equal(elapsed("2026-11-13T08:55:00Z", "running", now), "已进行 1 小时 5 分");
  assert.equal(nextFilter("", "failed"), "failed");
  assert.equal(nextFilter("failed", "failed"), "");
  assert.equal(nextFilter("failed", "running"), "running");
  const page = h.page("tasks");
  page.pick({ currentTarget: { dataset: { filter: "running" } } });
  assert.equal(page.data.filter, "running");
  page.pick({ currentTarget: { dataset: { filter: "running" } } });
  assert.equal(page.data.filter, "");
});
