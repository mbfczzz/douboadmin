const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

const models = ["image", "video", "chat"].map((kind) => ({
  id: kind + "-model",
  kind,
  name: "测试模型",
  resolutions: ["1k"],
  ratios: ["1:1"],
  durations: [5],
  modes: [],
  referenceTypes: [],
}));

async function creation(h, kind = "image") {
  const page = h.page("create");
  h.api.request = async () => ({ models });
  page.setData({ kind });
  await page.loadModels();
  page.setData({ prompt: "保留我的创作描述", modelsLoading: false });
  return page;
}
function feedback(h, responder) {
  const state = { submitted: 0, modals: 0, messages: [] };
  h.wx.showToast = (options) => state.messages.push(options.title);
  h.wx.showModal = async () => {
    state.modals++;
    return { confirm: true };
  };
  h.wx.redirectTo = (options) => h.nav.push(options);
  h.wx.request = (options) => {
    if (options.url.endsWith("/jobs/quote")) responder(options);
    else {
      state.submitted++;
      options.success({ statusCode: 202, data: { id: "unexpected-job" } });
    }
  };
  return state;
}
const insufficient = (options) =>
  options.success({
    statusCode: 200,
    data: {
      units: 300,
      availableUnits: 100,
      billingEnabled: true,
      sufficient: false,
    },
  });

for (const [prompt, expected, emptyModels] of [
  ["   ", "请输入要发送的内容", false],
  ["保留我的问题", "创作助手暂未开放，请稍后再试", true],
]) {
  test(`agent validation reports ${expected} without losing the message`, async () => {
    const h = harness(),
      page = h.page("agent"),
      messages = [];
    let requests = 0;
    h.wx.showToast = (options) => messages.push(options.title);
    h.api.request = async () => {
      requests++;
      return { models: [] };
    };
    page.setData({ prompt });
    await page.send();
    assert.deepEqual(messages, [expected]);
    assert.equal(requests, emptyModels ? 1 : 0);
    assert.equal(page.data.prompt, prompt);
    assert.equal(page.data.busy, false);
    assert.deepEqual(h.nav, []);
  });
}

for (const entry of ["image", "video", "template", "agent", "retry"]) {
  test(`${entry}: insufficient points show one hint and preserve the current page`, async () => {
    const h = harness();
    await h.api.signIn();
    const state = feedback(h, insufficient);
    let page;
    if (["image", "video"].includes(entry)) {
      page = await creation(h, entry);
      await page.generate();
      assert.equal(page.data.prompt, "保留我的创作描述");
    } else if (entry === "template") {
      page = h.page("template-detail");
      page.setData({
        template: {
          id: "template",
          data: {
            kind: "image",
            prompt: "模板描述",
            model: "image-model",
            resolution: "1k",
            ratio: "1:1",
          },
        },
      });
      await page.generate();
      assert.equal(page.data.template.id, "template");
    } else if (entry === "agent") {
      page = h.page("agent");
      h.api.request = async () => ({ models });
      page.setData({ prompt: "保留这条消息" });
      await page.send();
      assert.equal(page.data.prompt, "保留这条消息");
      assert.equal(page.data.messages.length, 0);
    } else {
      page = h.page("task-detail");
      page.onLoad({ id: "failed-job" });
      page.setData({
        job: {
          id: "failed-job",
          input: { kind: "image", model: "image-model", prompt: "原始描述" },
        },
      });
      await page.retry();
      assert.equal(page.data.job.id, "failed-job");
    }
    assert.equal(state.submitted, 0);
    assert.equal(state.modals, 0);
    assert.deepEqual(h.nav, []);
    assert.equal(state.messages.length, 1);
    assert.match(state.messages[0], /可用积分不足/);
    assert.match(state.messages[0], /需 3，当前 1/);
    assert.equal(page.data.busy, false);
  });
}

for (const [status, message] of [
  [400, "模型暂不可用"],
  [429, "请求过于频繁"],
  [503, "生成服务暂不可用"],
]) {
  test(`generation error ${status} is reported without clearing input or navigating`, async () => {
    const h = harness();
    await h.api.signIn();
    const state = feedback(h, (options) =>
      options.success({ statusCode: status, data: { error: message } }),
    );
    const page = await creation(h);
    await page.generate();
    assert.deepEqual(state.messages, [message]);
    assert.equal(state.submitted, 0);
    assert.equal(state.modals, 0);
    assert.equal(page.data.prompt, "保留我的创作描述");
    assert.equal(page.data.busy, false);
    assert.deepEqual(h.nav, []);
  });
}

test("a concurrent balance change at submission is also reported without navigation", async () => {
  const h = harness();
  await h.api.signIn();
  const messages = [];
  let modals = 0;
  h.wx.showToast = (options) => messages.push(options.title);
  h.wx.showModal = async () => {
    modals++;
    return { confirm: true };
  };
  h.wx.request = (options) =>
    options.success(
      options.url.endsWith("/jobs/quote")
        ? {
            statusCode: 200,
            data: {
              units: 300,
              availableUnits: 300,
              billingEnabled: true,
              sufficient: true,
            },
          }
        : { statusCode: 402, data: { error: "可用积分不足" } },
    );
  const page = await creation(h);
  await page.generate();
  assert.deepEqual(messages, ["可用积分不足"]);
  assert.equal(modals, 1);
  assert.equal(page.data.busy, false);
  assert.equal(page.data.prompt, "保留我的创作描述");
  assert.deepEqual(h.nav, []);
});
