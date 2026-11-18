const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { harness } = require("./harness.cjs");

test("quotes say 按次 or 按秒 with the per-second rate and this run's total", () => {
  const { quoteParts } = harness().service("../services/estimate");
  assert.deepEqual({ ...quoteParts({ units: 3500, billingEnabled: true, perSecond: true }, 5) },
    { quoteMode: "按秒", quoteRate: "每秒 7 积分 × 5 秒", quoteText: "本次 35 积分" });
  assert.deepEqual({ ...quoteParts({ units: 3500, billingEnabled: true, perSecond: false }, 5) },
    { quoteMode: "按次", quoteRate: "", quoteText: "本次 35 积分" });
  // Images (no duration) and older servers without the flag stay 按次.
  assert.equal(quoteParts({ units: 400, billingEnabled: true, perSecond: true }, 0).quoteMode, "按次");
  assert.equal(quoteParts({ units: 400, billingEnabled: true }, 5).quoteMode, "按次");
  assert.deepEqual({ ...quoteParts({ units: 0, billingEnabled: false }, 5) }, { quoteMode: "", quoteRate: "", quoteText: "本次不扣积分" });
  const wxml = fs.readFileSync("pages/create/index.wxml", "utf8");
  assert.match(wxml, /class="quote-mode">\{\{quoteMode\}\}/);
  assert.match(wxml, /class="quote-rate">\{\{quoteRate\}\}/);
});
