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
