const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

test("disabled SMS policy prevents stale send actions without disabling basic registration", async () => {
  const h = harness();
  const page = h.page("activate");
  page.setData({ logged: true, status: { smsRequired: false }, phone: "13900139000", name: "用户" });
  let sends = 0, submitted;
  h.api.request = async (path, method, body) => {
    if (path === "/access/sms") sends++;
    if (path === "/access/profile") submitted = body;
    return { smsRequired: false, profileRequired: false };
  };
  await page.sendCode();
  assert.equal(sends, 0);
  assert.equal(page.data.countdown, 0);
  await page.register();
  assert.equal(submitted.phone, "13900139000");
  assert.equal(submitted.name, "用户");
  assert.equal(submitted.code, undefined);
});
