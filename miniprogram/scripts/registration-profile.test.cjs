const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

test("registration without SMS still submits a phone and preserves the invitation", async () => {
  const h = harness(),
    page = h.page("activate"),
    sent = [];
  await h.api.signIn();
  page.owner = h.api.sessionUserId();
  page.setData({
    logged: true,
    code: "KMNP2345",
    name: " 张三 ",
    phone: "13800138000",
    smsCode: "123456",
    status: {
      active: false,
      status: "pending",
      profileRequired: true,
      smsRequired: false,
    },
  });
  h.api.request = async (path, method, body) => {
    sent.push([path, body]);
    return path === "/access/profile"
      ? {
          active: false,
          status: "pending",
          profileRequired: false,
          smsRequired: false,
        }
      : { active: false, status: "review" };
  };
  await page.register();
  assert.equal(page.data.code, "KMNP2345");
  assert.equal(page.data.status.profileRequired, false);
  assert.deepEqual(JSON.parse(JSON.stringify(sent)), [
    ["/access/profile", { name: "张三", phone: "13800138000" }],
  ]);
  await page.join(page.data.code, "code");
  assert.deepEqual(JSON.parse(JSON.stringify(sent[1])), [
    "/access/join",
    { code: "KMNP2345", method: "code" },
  ]);
  assert.equal(page.data.status.status, "review");
  assert.equal(page.data.code, "");
});

test("name and valid phone remain required without SMS", async () => {
  const h = harness(),
    page = h.page("activate"),
    sent = [];
  await h.api.signIn();
  page.owner = h.api.sessionUserId();
  page.setData({
    logged: true,
    status: {
      active: false,
      status: "pending",
      profileRequired: true,
      smsRequired: false,
    },
  });
  h.api.request = async (...args) => {
    sent.push(args.slice(0, 3));
    return { active: false, status: "pending" };
  };
  await page.register();
  page.setData({ name: "张三" });
  await page.register();
  page.setData({ phone: "123" });
  await page.register();
  assert.equal(sent.length, 0);
  page.setData({ phone: " 13800138000 " });
  await page.register();
  assert.deepEqual(JSON.parse(JSON.stringify(sent)), [
    ["/access/profile", "POST", { name: "张三", phone: "13800138000" }],
  ]);
});

for (const required of [true, undefined]) {
  test(`SMS registration remains mandatory when its flag is ${required}`, async () => {
    const h = harness(),
      page = h.page("activate"),
      requests = [],
      toasts = [];
    await h.api.signIn();
    page.owner = h.api.sessionUserId();
    page.setData({
      logged: true,
      name: "张三",
      status: {
        active: false,
        status: "pending",
        profileRequired: true,
        smsRequired: required,
      },
    });
    h.wx.showToast = (o) => toasts.push(o.title);
    h.api.request = async (path, method, body) => {
      requests.push([path, body]);
      return { active: false, status: "pending" };
    };
    await page.register();
    assert.equal(requests.length, 0);
    page.setData({ phone: "13800138000" });
    await page.register();
    assert.equal(requests.length, 0);
    page.setData({ smsCode: "123456" });
    await page.register();
    assert.deepEqual(JSON.parse(JSON.stringify(requests)), [
      [
        "/access/profile",
        { name: "张三", phone: "13800138000", code: "123456" },
      ],
    ]);
    assert.ok(toasts.some((value) => value.includes("手机号")));
    assert.ok(toasts.some((value) => value.includes("验证码")));
  });
}

test("a stale scan step refreshes profile requirements and keeps the scanned code", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("activate");
  page.owner = h.api.sessionUserId();
  page.setData({ logged: true, status: { active: false, status: "pending" } });
  h.api.request = async () => {
    throw new h.api.RequestError(403, "请先填写姓名");
  };
  h.wx.request = (o) =>
    o.success({
      statusCode: 200,
      data: {
        active: false,
        status: "pending",
        profileRequired: true,
        smsRequired: false,
      },
    });
  await page.join("KMNP2345", "scan");
  assert.equal(page.data.status.profileRequired, true);
  assert.equal(page.data.status.smsRequired, false);
  assert.equal(page.data.code, "KMNP2345");
  assert.equal(page.data.busy, false);
});
