const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

test("starter cards fill and focus the composer; replies copy in one tap", () => {
  const h = harness(),
    page = h.page("agent"),
    copied = [];
  assert.equal(page.data.quick.length, 3);
  for (const card of page.data.quick) assert.ok(card.prompt && card.hint && card.icon && card.tone);
  page.quick({ currentTarget: { dataset: { value: page.data.quick[0].prompt } } });
  assert.equal(page.data.prompt, "帮我写一段产品短视频脚本");
  assert.equal(page.data.focus, true);
  page.blur();
  assert.equal(page.data.focus, false);
  h.wx.setClipboardData = (o) => copied.push(o.data);
  page.copy({ currentTarget: { dataset: { text: "镜头 1：清晨街角" } } });
  assert.deepEqual(copied, ["镜头 1：清晨街角"]);
});

test("script replies split into shot labels; failures offer to edit the question", () => {
  const h = harness(),
    { chatMessages, scriptLines } = h.service("../utils/chat");
  assert.deepEqual(JSON.parse(JSON.stringify(scriptLines("镜头 1（0–3 秒）：清晨街角\n\n【结尾】字幕：开业啦\n普通一句"))), [
    { label: "镜头 1（0–3 秒）", text: "清晨街角" },
    { label: "", text: "" },
    { label: "结尾", text: "字幕：开业啦" },
    { label: "", text: "普通一句" },
  ]);
  const [, failed] = chatMessages([{ id: "j", status: "failed", error: "模型繁忙", input: { kind: "chat", prompt: "写个脚本" } }]);
  assert.equal(failed.failed, true);
  assert.equal(failed.text, "模型繁忙");
  assert.equal(failed.lines.length, 0);
  const page = h.page("agent");
  page.retry({ currentTarget: { dataset: { prompt: failed.prompt } } });
  assert.equal(page.data.prompt, "写个脚本");
  assert.equal(page.data.focus, true);
  assert.equal(page.data.followUps.length, 3);
});
