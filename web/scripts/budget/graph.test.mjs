import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { fixture } from "./fixtures.mjs";

test("static cycles terminate, shared initial assets and CSS count only once", (t) => {
  const f = fixture(t),
    report = f.report();
  assert.equal(
    report.initialJSBytes,
    Buffer.byteLength(f.files["assets/index.js"] + f.files["assets/common.js"]),
  );
  assert.equal(
    report.initialCSSGzipBytes,
    gzipSync(f.files["assets/base.css"]).length,
  );
  assert.equal(
    report.entries["src/pages/A.tsx"].jsGzipBytes,
    gzipSync(f.files["assets/A-hash.js"]).length,
  );
  assert.equal(
    report.entries["src/pages/A.tsx"].cssGzipBytes,
    gzipSync(f.files["assets/A.css"]).length,
  );
});

test("aliases sharing a file still traverse every declared dependency", (t) => {
  const f = fixture(
    t,
    {
      alias: { file: "assets/common.js", imports: ["extra"] },
      extra: { file: "assets/nested/extra.js" },
    },
    { "assets/nested/extra.js": "export const more=1;" },
  );
  f.manifest["index.html"].imports.push("alias", "common");
  f.saveManifest();
  const report = f.report();
  assert.equal(
    report.initialJSBytes,
    Buffer.byteLength(
      f.files["assets/index.js"] +
        f.files["assets/common.js"] +
        f.files["assets/nested/extra.js"],
    ),
  );
});

test("manual dynamic chunks without entry flags receive stable identities", (t) => {
  const f = fixture(
    t,
    {
      "_feature-hash.js": {
        name: "feature",
        file: "assets/feature-hash.js",
        imports: ["common"],
        dynamicImports: ["_feature-hash.js"],
      },
    },
    { "assets/feature-hash.js": "export default 2;" },
  );
  f.manifest["index.html"].dynamicImports = ["_feature-hash.js"];
  f.saveManifest();
  const report = f.report();
  assert.ok(report.entries["chunk:feature"]);
  assert.equal(
    report.initialJSBytes,
    Buffer.byteLength(f.files["assets/index.js"] + f.files["assets/common.js"]),
  );
});

test("changing content hashes does not reset an entry identity", (t) => {
  const f = fixture(t),
    before = f.report();
  f.write("dist/assets/A-newhash.js", "export default 3;");
  f.manifest["src/pages/A.tsx"].file = "assets/A-newhash.js";
  f.saveManifest();
  assert.deepEqual(
    Object.keys(f.report().entries),
    Object.keys(before.entries),
  );
});

test("module file extensions cannot hide JavaScript from transfer accounting", (t) => {
  const f = fixture(t),
    before = f.report();
  const code = "export const module = 'module extension fixture';";
  f.write("dist/assets/A.mjs", code);
  f.manifest["src/pages/A.tsx"].file = "assets/A.mjs";
  f.saveManifest();
  const next = f.report();
  assert.equal(
    next.entries["src/pages/A.tsx"].jsGzipBytes,
    gzipSync(code).length,
  );
  assert.equal(
    next.totalJSBytes,
    before.totalJSBytes + Buffer.byteLength(code),
  );
});

test("a lazy chunk cannot use only a content hash as its baseline identity", (t) => {
  const f = fixture(t, {
    "_hash-only.js": { file: "assets/A-hash.js", isDynamicEntry: true },
  });
  assert.throws(f.report, /Missing stable lazy entry identity/);
});

test("missing static or dynamic dependencies fail instead of undercounting", (t) => {
  const f = fixture(t);
  f.manifest.common.imports.push("missing");
  f.saveManifest();
  assert.throws(f.report, /Missing manifest dependency/);
  f.manifest.common.imports.pop();
  f.manifest.common.dynamicImports = ["missing"];
  f.saveManifest();
  assert.throws(f.report, /Missing dynamic dependency/);
});

test("escaping asset paths are rejected", (t) => {
  const f = fixture(t);
  f.manifest["index.html"].file = "../outside.js";
  f.saveManifest();
  assert.throws(f.report, /Invalid bundle asset/);
});

test("eager page loading is exposed for the policy to reject", (t) => {
  const f = fixture(t);
  f.manifest["index.html"].imports.push("src/pages/A.tsx");
  f.saveManifest();
  assert.equal(f.report().entries["src/pages/A.tsx"].eagerlyLoaded, true);
});

test("a manually grouped workspace page is still protected from eager loading", (t) => {
  const f = fixture(
    t,
    {
      "src/Workspace.tsx": {
        src: "src/Workspace.tsx",
        file: "assets/workspace.js",
        isDynamicEntry: true,
        dynamicImports: ["grouped"],
      },
      grouped: { name: "provider-page", file: "assets/providers.js" },
    },
    {
      "assets/workspace.js": "export default 2;",
      "assets/providers.js": "export default 3;",
    },
  );
  f.manifest["index.html"].imports.push("grouped");
  f.saveManifest();
  const entry = f.report().entries["chunk:provider-page"];
  assert.equal(entry.kind, "page");
  assert.equal(entry.eagerlyLoaded, true);
});
