// Decorative photographs: every name in UI_ART must ship in media/ui-art, and
// every page that shows one must keep a plain fallback when it is missing.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const source = read("utils/ui-art.ts");
const names = [...source.matchAll(/art\("([a-z0-9-]+)"\)/g)].map((m) => m[1]);

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

test("pictures use the stable API entry and are deployed with the release", () => {
  assert.match(source, /media\(`\/api\/ui-art\/\$\{name\}\?v=\$\{ART_VERSION\}`\)/);
  assert.match(source, /const ART_BASE = "";/, "private OSS signatures must not be hardcoded in the client");
  for (const file of ["deploy/native/build.sh", "deploy/native/deploy.sh"])
    assert.match(fs.readFileSync(path.join(root, "..", file), "utf8"), /ui-art/, file);
});

test("each photo slot keeps a flat fallback", () => {
  const slots = {
    "pages/create/parts/sheets.wxml": /wx:if="\{\{sourceArt\.image\}\}"[^]*?wx:else class="source-glyph/,
    "pages/template-detail/index.wxml": /wx:if="\{\{item\.image\}\}" class="source-photo"[^]*?wx:else class="source-glyph/,
    "pages/mix/parts/settings.wxml": /wx:if="\{\{item\.image\}\}"[^]*?<t-icon wx:else/,
    "pages/agent/index.wxml": /wx:if="\{\{item\.image\}\}" class="starter-photo"[^]*?wx:else/,
    "pages/login/index.wxml": /wx:if="\{\{backdrop\}\}" class="page-backdrop"/,
    "pages/activate/index.wxml": /wx:if="\{\{backdrop\}\}" class="page-backdrop"/,
    "pages/wallet/index.wxml": /wx:elif="\{\{backdrop\}\}" class="summary-photo"/,
  };
  for (const [file, pattern] of Object.entries(slots)) assert.match(read(file), pattern, file);
  // The grey under a loading photo comes from the slot itself.
  assert.match(read("styles/sheets.wxss"), /\.source-photo \{[^}]*background: var\(--ui-selected\)/);
});
