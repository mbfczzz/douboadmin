import fs from "node:fs";

// The repository requires LF source. Count the same UTF-8 content on every
// checkout without modifying source files or the installed vendor SDK.
export function sourceBytes(file) {
  return Buffer.byteLength(
    fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n"),
  );
}
