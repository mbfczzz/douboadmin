const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

test("a sent message is shown even when an older poll is still in flight", async () => {
  const h = harness();
  await h.api.signIn();
  const page = h.page("agent");
  let oldPoll,
    calls = 0;
  const sent = {
    id: "new-chat",
    status: "queued",
    input: { kind: "chat", prompt: "新的想法" },
  };
  h.api.request = async (path) => {
    if(path === "/config")return {models:[{id:"text-fixture",kind:"chat"}]};
    if (++calls === 1)
      return new Promise((resolve) => {
        oldPoll = resolve;
      });
    return [sent];
  };
  h.wx.request = async o => o.success({ statusCode: 200, data: await h.api.request(o.url.split("/api")[1]) });
  const pending = page.load();
  h.api.submitInput = async () => sent;
  page.input({ detail: { value: "新的想法" } });
  await page.send();
  assert.equal(page.data.messages[0].text, "新的想法");
  assert.equal(page.data.messages[1].pending, true);
  oldPoll([]);
  await pending;
  assert.equal(page.data.messages.length, 2);
});
