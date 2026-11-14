// Decorative photographs: every name in utils/ui-art must ship in media/ui-art, and
// every page that shows one must keep a plain fallback when it is missing.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const source = read("utils/ui-art.ts");
const names = [...source.slice(source.indexOf("const NAMES"), source.indexOf("export type Art")).matchAll(/: "([a-z0-9-]+)",/g)].map((m) => m[1]);

test("every UI art name is a shipped, small JPEG", () => {
  assert.ok(names.length >= 15);
  assert.equal(new Set(names).size, names.length, "one picture per name");
  for (const name of names) {
    const file = path.join(root, "..", "media", "ui-art", `${name}.jpg`);
    assert.ok(fs.existsSync(file), `${name}.jpg is missing`);
    const bytes = fs.readFileSync(file);
    assert.equal(bytes[0], 0xff, `${name} is not a JPEG`);
    assert.ok(bytes.length < 160 * 1024, `${name} should be compressed`);
  }
});

test("phones get signed HTTPS addresses from /config; the API path is only a fallback", async () => {
  assert.match(source, /signedUrl\(name, signed\?\.\[name\]\) \|\| media\(`\/api\/ui-art\/\$\{name\}\?v=\$\{ART_VERSION\}`\)/);
  for (const file of ["deploy/native/build.sh", "deploy/native/deploy.sh"])
    assert.match(fs.readFileSync(path.join(root, "..", file), "utf8"), /ui-art/, file);
  // Pages start empty and fill in from the config, so nothing unloadable is requested.
  const h = require("./harness.cjs").harness();
  const signed = "https://bucket.test/system/ui-art/k/mix-natural.jpg?sig=1";
  h.api.request = async (p) => (p === "/config" ? { uiArt: { "mix-natural": signed } } : {});
  const { showArt } = h.service("../utils/ui-art");
  const seen = [];
  showArt({ setData: (d) => seen.push(d) }, (art) => ({ a: art.mixNatural, b: art.mixFast }));
  await new Promise(setImmediate);
  assert.equal(seen.at(-1).a, signed);
  assert.match(seen.at(-1).b, /\/api\/ui-art\/mix-fast\?v=\d+$/);
  // A re-signed address for the same picture does not replace the one on screen.
  h.api.request = async (p) => (p === "/config" ? { uiArt: { "mix-natural": signed.replace("sig=1", "sig=2") } } : {});
  const { loadConfig } = h.service("../utils/config-cache");
  await loadConfig(true);
  showArt({ setData: (d) => seen.push(d) }, (art) => ({ a: art.mixNatural }));
  await new Promise(setImmediate);
  assert.equal(seen.at(-1).a, signed);
  for (const file of ["pages/mix/state.ts", "pages/wallet/state.ts", "pages/create/state.ts"]) assert.doesNotMatch(read(file), /\/api\/ui-art/, file);
});

test("each photo slot keeps a flat fallback", () => {
  const slots = {
    "pages/create/parts/sheets.wxml": /wx:if="\{\{sourceArt\.image\}\}"[^]*?wx:else class="source-glyph/,
    "pages/template-detail/index.wxml": /wx:if="\{\{item\.image\}\}" class="source-photo"[^]*?wx:else class="source-glyph/,
    "pages/mix/parts/settings.wxml": /wx:if="\{\{item\.image\}\}"[^]*?<t-icon wx:else/,
    "pages/agent/index.wxml": /wx:if="\{\{item\.image\}\}" class="starter-photo"[^]*?wx:else/,
    "pages/login/index.wxml": /wx:if="\{\{backdrop\}\}" class="page-backdrop"/,
    "pages/activate/index.wxml": /wx:if="\{\{backdrop\}\}" class="page-backdrop"/,
    "pages/wallet/index.wxml": /wx:if="\{\{backdrop\}\}" class="summary-photo"/,
  };
  for (const [file, pattern] of Object.entries(slots)) assert.match(read(file), pattern, file);
  // The grey under a loading photo comes from the slot itself.
  assert.match(read("styles/sheets.wxss"), /\.source-photo \{[^}]*background: var\(--ui-selected\)/);
});

test("generated icon art is bundled and every tab glyph has both states", () => {
  const icons = [...source.matchAll(/(photo|glyph)\("([a-z]+)"\)/g)].map((m) => `${m[2]}.${m[1] === "photo" ? "jpg" : "png"}`);
  assert.ok(icons.length >= 10);
  for (const file of icons) assert.ok(fs.existsSync(path.join(root, "assets", file.endsWith(".jpg") ? "photos" : "glyphs", file)), file);
  const tabs = [...read("utils/tab-transition.ts").matchAll(/art\("([a-z]+)"\)/g)].map((m) => m[1]);
  assert.equal(tabs.length, 5);
  for (const name of tabs)
    for (const state of ["on", "off"]) assert.ok(fs.existsSync(path.join(root, "assets/tab", `${name}-${state}.png`)), `${name}-${state}`);
  // The vector icon stays as the fallback when an entry has no art.
  assert.match(read("custom-tab-bar/index.wxml"), /wx:if="\{\{item\.art\}\}"[^]*<t-icon wx:else/);
  assert.match(read("pages/mine/index.wxml"), /wx:if="\{\{item\.art\}\}" class="menu-icon"[^]*<t-icon wx:else/);
});
