const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

// 文案提取 from a picture, a phone video or a chat file: a chat model that
// can take it reads the text; the result shows under that row.
const models = [
  { id: "text-only", kind: "chat", key: "relay:t", referenceTypes: [] },
  { id: "flash", kind: "chat", key: "deepseek:deepseek-flash", referenceTypes: ["image"] },
];

function page() {
  const h = harness(), sent = [];
  h.api.request = async (p) => (p === "/config" ? { models, uiArt: {} } : {});
  h.service("jobs").submitInput = async (input, channel) => { sent.push([input, channel]); return { id: "j1", status: "succeeded", result: " 第一行\n第二行 " }; };
  h.api.upload = async (path) => ({ id: path.endsWith(".mp4") ? "vid" : "pic", data: { url: "u", type: path.endsWith(".mp4") ? "video/mp4" : "image/jpeg" } });
  return { h, sent, p: h.page("extract") };
}

test("图片提取 reads a picture's text with a model that sees pictures", async () => {
  const { h, sent, p } = page();
  h.api.chooseMediaFile = async () => ({ path: "tmp/note.jpg" });
  p.choose({ currentTarget: { dataset: { key: "image" } } });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const [input, channel] = sent[0];
  assert.equal(input.model, "flash");
  assert.equal(input.kind, "chat");
  assert.deepEqual(JSON.parse(JSON.stringify(input.assets)), ["pic"]);
  assert.match(input.prompt, /提取这张图片中的全部文字/);
  assert.equal(channel, "extract-image");
  assert.equal(p.data.video.text, "第一行\n第二行");
  assert.equal(p.data.resultKey, "image");
  assert.equal(p.data.busy, false);
});

test("本地视频 asks a model that takes videos for the narration and captions", async () => {
  const { h, sent, p } = page();
  h.api.chooseReferenceFile = async () => ({ path: "tmp/clip.mp4" });
  await p.extractVideo();
  assert.equal(sent[0][0].model, "flash"); // a direct model: 视频理解 tells it what is said
  assert.match(sent[0][0].prompt, /口播、台词和画面字幕/);
  assert.equal(p.data.video.title, "视频中的文案");
  assert.equal(p.data.resultKey, "video");
});

test("微信文件 takes pictures and videos; audio and documents say they are coming", async () => {
  const { h, sent, p } = page();
  const toasts = [];
  h.wx.showToast = (o) => toasts.push(o.title);
  h.wx.chooseMessageFile = async () => ({ tempFiles: [{ path: "tmp/voice.mp3", name: "voice.mp3", size: 100 }] });
  await p.extractFile();
  assert.equal(sent.length, 0);
  assert.match(toasts.at(-1), /音频和文档即将开放/);
  assert.equal(p.data.busy, false);
  h.wx.chooseMessageFile = async () => ({ tempFiles: [{ path: "tmp/shot.jpg", name: "shot.jpg", size: 100 }] });
  await p.extractFile();
  assert.equal(sent.length, 1);
  assert.equal(p.data.resultKey, "file");
  p.choose({ currentTarget: { dataset: { key: "audio" } } });
  assert.match(toasts.at(-1), /音频转文字即将开放/);
});
