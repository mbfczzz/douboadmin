const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

function canvasHarness(h) {
  const context = new Proxy({measureText:text=>({width:text.length*24})}, {get:(o,k)=>o[k]||(()=>{})});
  const canvas = {getContext:()=>context, createImage:()=>({set src(value){this.source=value;queueMicrotask(()=>this.onload());}})};
  const query={in(){return this},select(){return this},fields(){return this},exec(fn){fn([{node:canvas}])}};
  h.wx.createSelectorQuery=()=>query;
  h.wx.canvasToTempFilePath=({success})=>success({tempFilePath:'/temp/poster.png'});
}

test("provider saves signed HTTPS QR via a temporary download", async () => {
  const h = harness(), page = h.page("provider"), saved = [], removed = [];
  canvasHarness(h);
  h.wx.downloadFile = ({ url, success }) => {
    assert.equal(url, "https://oss.test/code.png?signature=fresh");
    success({ statusCode: 200, tempFilePath: "/temp/qr.png" });
  };
  h.wx.saveImageToPhotosAlbum = async ({ filePath }) => saved.push(filePath);
  h.wx.getFileSystemManager = () => ({ unlink: ({ filePath }) => removed.push(filePath) });
  page.setData({ shown: { raw: "ABCD2345", qr: "https://oss.test/code.png?signature=fresh" } });
  await page.save();
  assert.deepEqual(saved, ["/temp/poster.png"]);
  assert.deepEqual(removed, ["/temp/poster.png", "/temp/qr.png"]);
  assert.equal(page.data.busy, false);
});

test("provider does not save an expired signed QR response", async () => {
  const h = harness(), page = h.page("provider");
  let saves = 0, toast;
  h.wx.downloadFile = ({ success }) => success({ statusCode: 403, tempFilePath: "/temp/error.xml" });
  h.wx.saveImageToPhotosAlbum = async () => saves++;
  h.wx.showToast = (value) => toast = value;
  page.setData({ shown: { raw: "ABCD2345", qr: "https://oss.test/code.png?expired" } });
  await page.save();
  assert.equal(saves, 0);
  assert.match(toast.title, /刷新页面后重试/);
  assert.equal(page.data.busy, false);
});

test("provider preserves inline development QR compatibility", async () => {
  const h = harness(), page = h.page("provider");
  canvasHarness(h);
  let written, saved;
  h.wx.env = { USER_DATA_PATH: "/user-data" };
  h.wx.getFileSystemManager = () => ({ writeFileSync: (...args) => written = args, unlink() {} });
  h.wx.saveImageToPhotosAlbum = async ({ filePath }) => saved = filePath;
  page.setData({ shown: { raw: "ABCD2345", qr: "data:image/png;base64,AAAA" } });
  await page.save();
  assert.deepEqual(written, ["/user-data/share-ABCD2345.png", "AAAA", "base64"]);
  assert.equal(saved, "/temp/poster.png");
});
