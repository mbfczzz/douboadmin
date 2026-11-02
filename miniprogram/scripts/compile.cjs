const { wxmlToJs, wxssToJs } = require("miniprogram-compiler");
const fs = require("node:fs");
const path = require("node:path");
const root = process.cwd();
const files = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "miniprogram_npm", "scripts"].includes(item.name))
      continue;
    const file = path.join(dir, item.name);
    if (item.isDirectory()) walk(file);
    else files.push(path.relative(root, file).replaceAll("\\", "/"));
  }
}
// This legacy wrapper checks authored markup only. The IDE compiles npm SDKs.
walk(root);
const code = wxmlToJs(root, {
  wxmlList: files.filter((f) => f.endsWith(".wxml")),
  wxsList: files.filter((f) => f.endsWith(".wxs")),
});
new Function("global", code);
wxssToJs(root, { wxssList: files.filter((f) => f.endsWith(".wxss")) });
console.log(
  "WXML / WXSS compiled successfully with the WeChat compiler wrapper.",
);
