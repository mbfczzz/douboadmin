import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
const root = process.cwd();
const app = JSON.parse(fs.readFileSync("app.json", "utf8"));
const errors = [];
function readWxml(file, seen = new Set()) {
  const full = path.resolve(file);
  if (seen.has(full)) throw new Error(`Recursive WXML include: ${file}`);
  const next = new Set(seen).add(full);
  return fs
    .readFileSync(full, "utf8")
    .replace(/<include\s+src="([^"]+)"\s*\/>/g, (_, ref) =>
      readWxml(path.resolve(path.dirname(full), ref), next),
    );
}
// Handlers may live in a sibling module as `export const x = {...}` and be
// spread into Page({ ...x }); collect their names too.
function spreadMembers(page, source, name) {
  const spec = source.statements
    .filter(ts.isImportDeclaration)
    .find((d) => d.importClause?.namedBindings?.elements?.some((e) => e.name.text === name));
  if (!spec) return [];
  const file = path.resolve(path.dirname(page), spec.moduleSpecifier.text + ".ts");
  if (!fs.existsSync(file)) return [];
  const mod = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const names = [];
  for (const statement of mod.statements.filter(ts.isVariableStatement))
    for (const d of statement.declarationList.declarations)
      if (d.name.getText(mod) === name && d.initializer && ts.isObjectLiteralExpression(d.initializer))
        for (const m of d.initializer.properties) if (m.name) names.push(m.name.getText(mod));
  return names;
}
for (const p of app.pages) {
  for (const ext of [".ts", ".json", ".wxml", ".wxss"])
    if (!fs.existsSync(p + ext)) errors.push(`Missing ${p + ext}`);
  if (!fs.existsSync(p + ".ts") || !fs.existsSync(p + ".wxml")) continue;
  const source = ts.createSourceFile(
    p + ".ts",
    fs.readFileSync(p + ".ts", "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const methods = new Set();
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === "Page" &&
      node.arguments[0] &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      for (const member of node.arguments[0].properties) {
        if (member.name) methods.add(member.name.getText(source));
        else if (ts.isSpreadAssignment(member))
          spreadMembers(p, source, member.expression.getText(source)).forEach((m) => methods.add(m));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  const wxml = readWxml(p + ".wxml");
  const local =
    JSON.parse(fs.readFileSync(p + ".json", "utf8")).usingComponents || {};
  const tags = new Set([
    "view",
    "text",
    "image",
    "scroll-view",
    "textarea",
    "input",
    "picker",
    "slider",
    "switch",
    "progress",
    "video",
    "block",
    "button",
    "form",
    "navigator",
    "slot",
    "template",
    "import",
    "include",
    "wxs",
    ...Object.keys(app.usingComponents),
    ...Object.keys(local),
  ]);
  // WeChat <text> renders line breaks literally: an indented break inside one
  // is formatting, not copy, and shows users a broken line.
  for (const match of wxml.matchAll(/<text\b[^>]*>([^<]*)/g))
    if (/\n[ \t]+\S/.test(match[1]) || /^\s*\n/.test(match[1]))
      errors.push(`${p}.wxml: line break inside <text> (keep its text on one line)`);
  for (const match of wxml.matchAll(/<\/?([a-z][a-z-]*)\b/g)) {
    if (!tags.has(match[1]))
      errors.push(`${p}: unsupported native tag ${match[1]}`);
  }
  for (const match of wxml.matchAll(/\b(?:bind|catch):?[\w-]+="([^"{]+)"/g)) {
    if (!methods.has(match[1]))
      errors.push(`${p}: handler ${match[1]} is missing`);
  }
  const icons = fs.readFileSync(
    "node_modules/tdesign-miniprogram/miniprogram_dist/icon/icon.wxss",
    "utf8",
  );
  for (const match of wxml.matchAll(/<t-icon\s+name="([a-z-]+)"/g)) {
    if (!icons.includes("t-icon-" + match[1] + ":before"))
      errors.push(`${p}: unknown icon ${match[1]}`);
  }
}
const declarations = [
  app.usingComponents,
  ...app.pages.map(
    (p) =>
      JSON.parse(fs.readFileSync(p + ".json", "utf8")).usingComponents || {},
  ),
];
for (const [name, loc] of declarations.flatMap((c) => Object.entries(c))) {
  const target = loc.startsWith("tdesign-miniprogram/")
    ? "node_modules/tdesign-miniprogram/miniprogram_dist/" +
      loc.replace("tdesign-miniprogram/", "")
    : "." + loc;
  if (!fs.existsSync(target + ".json"))
    errors.push(`Missing component ${name}: ${target}`);
}
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "miniprogram_npm", "scripts"].includes(item.name))
      continue;
    const p = path.join(dir, item.name);
    if (item.isDirectory()) walk(p);
    else if (p.endsWith(".ts")) {
      const source = ts.createSourceFile(
        p,
        fs.readFileSync(p, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      function checkSyntax(node) {
        // WeChat's built-in TS 4.1 requires separate `import type` declarations.
        if (
          (ts.isImportSpecifier(node) && node.isTypeOnly) ||
          (ts.isExportDeclaration(node) &&
            node.isTypeOnly &&
            !node.exportClause)
        )
          errors.push(
            `${p}: use separate import type / named export type for IDE compatibility`,
          );
        ts.forEachChild(node, checkSyntax);
      }
      checkSyntax(source);
    } else if (p.endsWith(".json")) {
      try {
        JSON.parse(fs.readFileSync(p, "utf8"));
      } catch (e) {
        errors.push(`${p}: ${e.message}`);
      }
    }
  }
}
walk(root);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(
  `Validated ${app.pages.length} native pages, event handlers, icons, JSON files and TDesign component paths.`,
);
