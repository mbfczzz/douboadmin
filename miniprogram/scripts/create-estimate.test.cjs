const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
const event = (value) => ({ currentTarget: { dataset: { value } } });
const tick = () => new Promise(setImmediate);

async function fixture(authenticated = true) {
  const timers = new Map(),
    requests = [],
    messages = [];
  let id = 0;
  const h = harness({
    setTimeout(fn) {
      timers.set(++id, fn);
      return id;
    },
    clearTimeout(key) {
      timers.delete(key);
    },
  });
  if (authenticated)
    h.storage.set("douboSession", {
      token: "estimate-owner",
      userId: "user",
      expiresAt: Date.now() + 60000,
    });
  const image = {
    id: "image-priced",
    kind: "image",
    name: "图片模型",
    resolutions: ["1k", "2k"],
    ratios: ["1:1", "16:9"],
    qualities: ["low", "high"],
    modes: ["i2i"],
    referenceTypes: ["image"],
  };
  const video = {
    ...image,
    id: "video-priced",
    kind: "video",
    durations: [5, 10],
    modes: ["t2v"],
  };
  h.api.request = async () => ({ models: [image, video] });
  h.wx.showToast = (o) => messages.push(o);
  h.wx.showModal = () => {
    throw new Error("background pricing opened a modal");
  };
  h.wx.request = (o) => {
    requests.push(o);
    return {
      abort() {
        o.aborted = true;
        o.fail();
      },
    };
  };
  const page = h.page("create");
  page.setData({ kind: "image" });
  await page.loadModels();
  return {
    h,
    page,
    requests,
    messages,
    async flush() {
      for (const [key, fn] of [...timers]) {
        timers.delete(key);
        fn();
      }
      await tick();
    },
  };
}
const reply = (o, units, billingEnabled = true) =>
  o.success({ statusCode: 200, data: { units, billingEnabled } });

test("shows the server price before typing or attaching required references", async () => {
  const f = await fixture();
  assert.equal(f.page.data.prompt, "");
  assert.equal(f.page.data.quoteUnits, null);
  assert.equal(f.page.data.quoteBusy, true);
  await f.flush();
  assert.equal(f.requests.length, 1);
  const request = f.requests[0];
  assert.equal(request.method, "GET");
  assert.match(request.url, /\/api\/jobs\/estimate\?/);
  assert.doesNotMatch(request.url, /prompt|assets|expectedCost/);
  assert.equal(request.header.Authorization, "Bearer estimate-owner");
  reply(request, 625);
  await tick();
  assert.equal(f.page.data.quoteText, "预计 6.25 积分");
  f.page.input({ detail: { value: "一只小猫" } });
  await f.flush();
  assert.equal(
    f.requests.length,
    1,
    "typing must not trigger more pricing requests",
  );
  assert.deepEqual(f.h.nav, []);
  assert.deepEqual(f.messages, []);
});

test("rapid parameter changes debounce and stale responses cannot replace a newer price", async () => {
  const f = await fixture();
  f.page.chooseQuality(event("high"));
  f.page.chooseResolution(event("2k"));
  f.page.chooseRatio(event("16:9"));
  await f.flush();
  assert.equal(f.requests.length, 1);
  assert.match(f.requests[0].url, /resolution=2k/);
  assert.match(f.requests[0].url, /quality=high/);
  f.page.chooseResolution(event("1k"));
  assert.equal(f.requests[0].aborted, true);
  await f.flush();
  reply(f.requests[1], 700);
  await tick();
  reply(f.requests[0], 99900);
  await tick();
  assert.equal(f.page.data.quoteUnits, 700);
  assert.equal(f.page.data.quoteText, "预计 7 积分");
  f.page.chooseResolution(event("1k"));
  await f.flush();
  assert.equal(
    f.requests.length,
    2,
    "same parameters should reuse the recent estimate",
  );
});

test("switching models and video duration refreshes estimates; busy controls preserve input", async () => {
  const f = await fixture();
  await f.flush();
  f.page.mode({ currentTarget: { dataset: { kind: "video" } } });
  await tick();
  await f.flush();
  assert.match(f.requests[1].url, /model=video-priced/);
  assert.match(f.requests[1].url, /duration=5/);
  f.page.duration({ detail: { value: 1 } });
  await f.flush();
  assert.match(f.requests[2].url, /duration=10/);
  reply(f.requests[2], 1800);
  await tick();
  f.page.setData({ busy: true });
  f.page.duration({ detail: { value: 0 } });
  f.page.chooseResolution(event("2k"));
  f.page.chooseQuality(event("high"));
  assert.equal(f.page.data.duration, 10);
  assert.equal(f.page.data.resolution, "1k");
  assert.equal(f.page.data.quality, "low");
});

for (const statusCode of [401, 403, 503, 200]) {
  test(`failed or malformed estimate (${statusCode}) stays inline and can retry`, async () => {
    const f = await fixture();
    await f.flush();
    f.requests[0].success({
      statusCode,
      data: { units: "0", billingEnabled: true },
    });
    await tick();
    assert.equal(f.page.data.quoteUnits, null);
    assert.equal(f.page.data.quoteText, "积分暂无法估算 · 重试");
    assert.equal(f.page.data.quoteBusy, false);
    assert.deepEqual(f.messages, []);
    assert.deepEqual(f.h.nav, []);
    f.page.retryEstimate();
    await f.flush();
    reply(f.requests[1], 0, false);
    await tick();
    assert.equal(f.page.data.quoteText, "本次不扣积分");
    assert.equal(f.page.data.quoteError, false);
  });
}

test("anonymous viewing does not start a login flow or claim a free price", async () => {
  const f = await fixture(false);
  await f.flush();
  assert.equal(f.page.data.quoteText, "登录后查看积分");
  assert.equal(f.page.data.quoteUnits, null);
  assert.equal(f.requests.length, 0);
  assert.deepEqual(f.h.nav, []);
});

test("hidden pages abort estimates and returning reloads the backend price", async () => {
  const f = await fixture();
  await f.flush();
  f.page.onHide();
  assert.equal(f.requests[0].aborted, true);
  reply(f.requests[0], 500);
  await tick();
  assert.equal(f.page.data.quoteUnits, null);
  f.page.visible = true;
  await f.page.loadModels();
  await f.flush();
  reply(f.requests[1], 950);
  await tick();
  assert.equal(f.page.data.quoteText, "预计 9.50 积分");
  f.page.onUnload();
});

test("a switched account cannot display the previous owner's estimate", async () => {
  const f = await fixture();
  await f.flush();
  f.h.storage.set("douboSession", {
    token: "new-owner",
    expiresAt: Date.now() + 60000,
  });
  reply(f.requests[0], 300);
  await tick();
  assert.equal(f.page.data.quoteUnits, null);
  f.page.retryEstimate();
  await f.flush();
  assert.equal(f.requests[1].header.Authorization, "Bearer new-owner");
  reply(f.requests[1], 800);
  await tick();
  assert.equal(f.page.data.quoteUnits, 800);
});

test("changing a setting keeps the last price on screen until the new one arrives", async () => {
  const f = await fixture();
  await f.flush();
  reply(f.requests[0], 625);
  await tick();
  assert.equal(f.page.data.quoteText, "预计 6.25 积分");
  const seen = [];
  const set = f.page.setData.bind(f.page);
  f.page.setData = (v) => { if ("quoteText" in v) seen.push(v.quoteText); set(v); };
  f.page.chooseResolution(event("2k"));
  assert.equal(f.page.data.quoteText, "预计 6.25 积分"); // no "正在估算" flicker
  await f.flush();
  reply(f.requests.at(-1), 900);
  await tick();
  assert.deepEqual(seen, ["预计 9 积分"]);
});
