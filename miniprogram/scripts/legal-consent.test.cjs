const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { harness } = require("./harness.cjs");

test("legal consent starts unchecked and blocks login data collection", () => {
  const h = harness(),
    consent = h.service("legal-consent"),
    toasts = [],
    page = {
      data: { ...consent.legalConsentState },
      setData(value) { Object.assign(this.data, value); },
    };
  h.wx.showToast = (options) => toasts.push(options.title);
  assert.equal(page.data.legalAgreed, false);
  assert.equal(consent.requireLegalConsent(page), false);
  assert.match(toasts[0], /请先阅读并同意/);
  consent.legalConsent.call(page, { detail: { checked: true } });
  assert.equal(page.data.legalAgreed, true);
  assert.equal(consent.requireLegalConsent(page), true);
});

test("phone authorization exists only after active agreement on every entry", () => {
  const component = fs.readFileSync("components/legal-consent/index.wxml", "utf8");
  assert.match(component, /《用户服务协议》/);
  assert.match(component, /《隐私政策》/);
  // A small custom check that reads as one wrapping sentence, not the oversized native box.
  assert.match(component, /aria-role="checkbox"[^>]+aria-checked="{{checked}}"/);
  assert.doesNotMatch(component, /<checkbox/);
  for (const page of ["login", "activate"]) {
    const markup = fs.readFileSync(`pages/${page}/index.wxml`, "utf8");
    const config = fs.readFileSync(`pages/${page}/index.json`, "utf8");
    assert.match(markup, /<legal-consent[^>]+legalAgreed/);
    assert.match(markup, /phoneReady&&legalAgreed/);
    assert.match(config, /components\/legal-consent\/index/);
  }
});

test("activation keeps every agreement link and dims login until consent", () => {
  const markup = fs.readFileSync("pages/activate/index.wxml", "utf8");
  // Agreement entries stay reachable for review: in the consent line and the footer.
  for (const mode of ["terms", "privacy"]) assert.match(markup, new RegExp(`library/index\\?mode=${mode}`));
  assert.match(markup, /微信隐私指引/);
  assert.match(markup, /class="biz-action needs-consent"/);
});
