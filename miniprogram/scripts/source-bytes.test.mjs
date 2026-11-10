import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sourceBytes } from "./source-bytes.mjs";

test("source budgets count identical UTF-8 code equally with LF and CRLF", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doubo-source-bytes-"));
  const lf = path.join(dir, "lf.ts"),
    crlf = path.join(dir, "crlf.ts");
  t.after(() => {
    fs.rmSync(lf, { force: true });
    fs.rmSync(crlf, { force: true });
    fs.rmdirSync(dir);
  });
  const source = 'const name = "姓名";\nconst sms = false;\n';
  fs.writeFileSync(lf, source);
  fs.writeFileSync(crlf, source.replaceAll("\n", "\r\n"));
  assert.equal(sourceBytes(lf), Buffer.byteLength(source));
  assert.equal(sourceBytes(crlf), sourceBytes(lf));
  assert.ok(fs.statSync(crlf).size > sourceBytes(crlf));
  fs.appendFileSync(crlf, "const added = true;\r\n");
  assert.equal(
    sourceBytes(crlf) - sourceBytes(lf),
    Buffer.byteLength("const added = true;\n"),
  );
});
