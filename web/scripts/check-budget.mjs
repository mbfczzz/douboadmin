import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
const root = path.resolve("dist");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, ".vite/manifest.json"), "utf8"),
);
const initial = new Set();
function visit(key) {
  const item = manifest[key];
  if (!item) return;
  initial.add(item.file);
  for (const css of item.css || []) initial.add(css);
  for (const dependency of item.imports || []) visit(dependency);
}
visit("index.html");
const files = fs
  .readdirSync(path.join(root, "assets"))
  .filter((f) => /\.(js|css)$/.test(f))
  .map((f) => "assets/" + f);
const bytes = (items, gzip = false) =>
  items.reduce((n, f) => {
    const buffer = fs.readFileSync(path.join(root, f));
    return n + (gzip ? gzipSync(buffer).length : buffer.length);
  }, 0);
const initialJS = [...initial].filter((f) => f.endsWith(".js"));
const result = {
  initialJSBytes: bytes(initialJS),
  initialJSGzipBytes: bytes(initialJS, true),
  totalJSGzipBytes: bytes(
    files.filter((f) => f.endsWith(".js")),
    true,
  ),
  totalCSSGzipBytes: bytes(
    files.filter((f) => f.endsWith(".css")),
    true,
  ),
  chunks: files.length,
};
// Independently lazy routes receive explicit measured caps; shared code keeps
// its original cap. Initial JS stays at 80 KiB and no code moves to a CDN.
const routeCaps = {
  Orders: 2,
  Payments: 2,
  Works: 2,
  Reviews: 2,
  Monitor: 2,
  AdminAccounts: 2,
  // New UX work stays independently lazy and cannot inflate existing shared code.
  Overview: 2.25,
  Workspace: 4.25,
  CommandPalette: 1.5,
};
const newRoutes = Object.keys(routeCaps);
const routeBudgets = Object.fromEntries(
  newRoutes.map((name) => {
    const file = files.find(
      (f) => f.startsWith(`assets/${name}-`) && f.endsWith(".js"),
    );
    if (!file) throw new Error(`Missing lazy route ${name}`);
    return [name, bytes([file], true)];
  }),
);
result.routeJSGzipBytes = routeBudgets;
result.sharedAndExistingJSGzipBytes =
  result.totalJSGzipBytes -
  Object.values(routeBudgets).reduce((a, b) => a + b, 0);
// New partner requirements are a separately loaded feature, not an increased
// allowance for existing dependencies. The former shared 100 KiB budget is
// split into 98.5 KiB for the remainder and 1.5 KiB for the user route; that
// route receives a further 1.5 KiB for activation controls. Initial JS stays 80 KiB.
const partnerFiles = files.filter(
  (f) => f.startsWith("assets/partner-business-") && f.endsWith(".js"),
);
const userFiles = files.filter(
  (f) => f.startsWith("assets/Users-") && f.endsWith(".js"),
);
if (partnerFiles.length !== 1 || userFiles.length !== 1)
  throw new Error("Missing partner or user route chunk");
result.partnerJSGzipBytes = bytes(partnerFiles, true);
result.usersJSGzipBytes = bytes(userFiles, true);
result.sharedAndExistingJSGzipBytes -=
  result.partnerJSGzipBytes + result.usersJSGzipBytes;
console.log("Web bundle budget:", JSON.stringify(result));
if (
  result.initialJSGzipBytes > 80 * 1024 ||
  result.sharedAndExistingJSGzipBytes > 98.5 * 1024 ||
  result.partnerJSGzipBytes > 12 * 1024 ||
  result.usersJSGzipBytes > 3 * 1024 ||
  Object.entries(routeBudgets).some(
    ([name, size]) => size > routeCaps[name] * 1024,
  ) ||
  result.totalCSSGzipBytes > 8 * 1024
) {
  throw new Error(
    "Bundle budget exceeded; inspect dependencies and lazy boundaries before increasing limits.",
  );
}
fs.writeFileSync(
  path.join(root, "budget.json"),
  JSON.stringify(result, null, 2),
);
