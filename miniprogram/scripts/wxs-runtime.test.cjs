const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { wxmlToJs } = require("miniprogram-compiler");

// Runs utils/mentions.wxs the way the phone does: compiled by the WeChat
// compiler and executed in its WXS runtime (nv_ shims, $gdc data passing).
// A plain-Node run once passed while devices showed nothing (WXS regexes
// expose no lastIndex), so this test uses the real runtime.
function compiledMentions() {
  const code = wxmlToJs(process.cwd(), { wxmlList: ["pages/create/index.wxml"], wxsList: ["utils/mentions.wxs"] });
  const start = code.indexOf("var nf_init=function"), end = code.indexOf("function _af(");
  const module = code.split("\n").find((line) => line.startsWith("function np_0("));
  assert.ok(start >= 0 && end > start && module, "WXS runtime found in compiler output");
  const ctx = { console, wh: { rv: (x) => x }, __WXML_GLOBAL__: {} };
  vm.createContext(ctx);
  vm.runInContext(code.slice(start, end) + "\n" + module + "\n;nf_init();", ctx);
  // Data and calls stay inside the runtime's realm, as on the device.
  return (name, args) => JSON.parse(vm.runInContext(
    `JSON.stringify($gdc(np_0()["nv_${name}"].apply(null, $gdc(${JSON.stringify(args)}, "nv_"))))`, ctx));
}

test("on the device runtime, @ references become chips and the referenced row", () => {
  const call = compiledMentions();
  const assets = [
    { id: "img", isImage: true, isVideo: false, data: { url: "https://fixture.test/1.png", thumbnailUrl: "" } },
    { id: "clip", isImage: false, isVideo: true, data: { url: "https://fixture.test/c.mp4", thumbnailUrl: "https://fixture.test/c.jpg" } },
  ];
  assert.deepEqual(call("segments", ["这个@图片1 美女＠视频1", assets]), [
    { text: "这个" },
    { chip: true, id: "img", label: "图片1", url: "https://fixture.test/1.png", video: false },
    { text: " 美女" },
    { chip: true, id: "clip", label: "视频1", url: "https://fixture.test/c.jpg", video: true },
  ]);
  assert.deepEqual(call("list", ["@图片1 和 @图片1 @图片9", assets]).map((c) => c.id), ["img"]);
  assert.equal(call("any", [assets]), true);
  assert.equal(call("any", [[{ id: "voice", isImage: false, isVideo: false, data: {} }]]), false);
});
