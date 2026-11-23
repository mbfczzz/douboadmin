const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { harness } = require("./harness.cjs");

const document = (title) => ({
  title,
  effectiveDate: "2026年11月23日",
  summary: "说明",
  sections: [{ title: "内容", paragraphs: ["正文"] }],
  contacts: [{ label: "客服电话", value: "19953955305", action: "phone" }],
});

test("legal and support documents are public modes with working contact actions", async () => {
  const h = harness(), calls = [];
  h.api.request = async (path) => document(path.endsWith("privacy") ? "隐私政策" : "客服与投诉");
  h.wx.makePhoneCall = ({ phoneNumber }) => calls.push(["phone", phoneNumber]);
  h.wx.setClipboardData = ({ data, success }) => { calls.push(["copy", data]); success?.(); };
  h.wx.showToast = () => {};
  const privacy = h.page("library");
  privacy.onLoad({ mode: "privacy" });
  await privacy.load();
  assert.equal(privacy.data.title, "隐私政策");
  assert.equal(privacy.data.document.title, "隐私政策");
  const supportHarness = harness();
  supportHarness.api.request = h.api.request;
  supportHarness.wx.makePhoneCall = h.wx.makePhoneCall;
  supportHarness.wx.setClipboardData = h.wx.setClipboardData;
  supportHarness.wx.showToast = h.wx.showToast;
  const support = supportHarness.page("library");
  support.onLoad({ mode: "support" });
  await support.load();
  support.contact({ currentTarget: { dataset: { action: "phone", value: "19953955305" } } });
  support.contact({ currentTarget: { dataset: { action: "copy", value: "564909176@qq.com" } } });
  assert.deepEqual(calls, [["phone", "19953955305"], ["copy", "564909176@qq.com"]]);
  assert.match(fs.readFileSync("pages/library/index.wxml", "utf8"), /open-type="contact"/);
});

test("login, activation and settings expose both legal documents", () => {
  const h = harness(), preferences = h.page("preferences");
  preferences.terms();
  h.api.resetNavigation(preferences);
  preferences.policy();
  h.api.resetNavigation(preferences);
  preferences.support();
  assert.deepEqual(h.nav.map((item) => item.url), [
    "/pages/library/index?mode=terms",
    "/pages/library/index?mode=privacy",
    "/pages/library/index?mode=support",
  ]);
  for (const file of ["pages/login/index.wxml", "pages/activate/index.wxml"]) {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /mode=terms/);
    assert.match(source, /mode=privacy/);
  }
});
