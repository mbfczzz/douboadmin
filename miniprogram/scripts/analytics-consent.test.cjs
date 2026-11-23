const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

test("visit and feature analytics send nothing before explicit consent", () => {
  const h = harness(), analytics = h.service("analytics"), sent = [];
  h.wx.getDeviceInfo = () => ({ platform: "android" });
  h.wx.request = (options) => sent.push(options);
  analytics.resumeVisit(1001);
  analytics.trackVisit({ route: "pages/templates/index" });
  analytics.featureClick("template");
  assert.equal(sent.length, 0);
  assert.equal(h.storage.has("visitor-id"), false);
  h.storage.set("analytics-consent", true);
  analytics.trackVisit({ route: "pages/studio/index" });
  analytics.featureClick("tryon");
  assert.equal(sent.filter((item) => item.url.includes("/api/visits")).length, 1);
  assert.equal(sent.filter((item) => item.url.includes("/api/features/tryon/click")).length, 1);
  assert.equal(h.storage.has("visitor-id"), true);
});
