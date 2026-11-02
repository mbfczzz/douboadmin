import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// Read-only dependency audit. WeChat's official npm builder still produces the
// upload package; this scanner never rewrites or vendors the SDK.
export function collectDependencies(root) {
  const files = new Set(),
    external = new Set(),
    packages = new Set();
  const exists = (p) => fs.existsSync(p) && fs.statSync(p).isFile();
  function resolve(from, spec) {
    if (/^(https?:|data:|wx:|plugin:)/.test(spec)) {
      external.add(spec);
      return null;
    }
    if (spec.startsWith("/")) return path.join(root, spec.slice(1));
    if (spec.startsWith(".")) return path.resolve(path.dirname(from), spec);
    const parts = spec.split("/");
    const name = parts[0].startsWith("@")
      ? parts.splice(0, 2).join("/")
      : parts.shift();
    packages.add(name);
    const dir = path.join(root, "node_modules", name),
      pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    return parts.length
      ? path.join(dir, pkg.miniprogram || "", ...parts)
      : path.join(dir, pkg.main || "index.js");
  }
  function moduleFile(base) {
    return [
      base,
      base + ".ts",
      base + ".js",
      base + ".wxs",
      path.join(base, "index.ts"),
      path.join(base, "index.js"),
    ].find(exists);
  }
  function component(from, spec) {
    const base = resolve(from, spec);
    if (!base) return;
    for (const ext of [".json", ".wxml", ".wxss"]) {
      const p = base + ext;
      if (exists(p)) walk(p);
    }
    const code = moduleFile(base);
    if (code) walk(code);
    else throw new Error("Missing component: " + base);
  }
  function ref(from, spec) {
    const base = resolve(from, spec);
    if (!base) return;
    const target = moduleFile(base);
    if (!target) throw new Error(`Missing dependency ${spec} from ${from}`);
    walk(target);
  }
  function walk(file) {
    file = path.resolve(file);
    if (files.has(file)) return;
    files.add(file);
    const source = fs.readFileSync(file, "utf8"),
      ext = path.extname(file);
    if (ext === ".json") {
      const c = JSON.parse(source);
      for (const spec of Object.values(c.usingComponents || {}))
        component(file, spec);
      return;
    }
    if (ext === ".wxss") {
      for (const m of source.matchAll(/@import\s+['"]([^'"]+)['"]/g))
        ref(file, m[1]);
      for (const m of source.matchAll(/url\(\s*['"]?(https?:[^'"\s)]+)/g))
        external.add(m[1]);
      return;
    }
    if (ext === ".wxml") {
      for (const m of source.matchAll(
        /<(?:import|include|wxs)\b[^>]*\bsrc=['"]([^'"]+)['"]/g,
      ))
        ref(file, m[1]);
      return;
    }
    if ([".ts", ".js", ".wxs"].includes(ext)) {
      const ast = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node) => {
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier) &&
          !node.isTypeOnly &&
          !node.importClause?.isTypeOnly
        )
          ref(file, node.moduleSpecifier.text);
        if (
          ts.isCallExpression(node) &&
          node.expression.getText(ast) === "require" &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0])
        )
          ref(file, node.arguments[0].text);
        ts.forEachChild(node, visit);
      };
      visit(ast);
    }
  }
  const appFile = path.join(root, "app.json"),
    app = JSON.parse(fs.readFileSync(appFile, "utf8"));
  walk(appFile);
  walk(path.join(root, "app.ts"));
  walk(path.join(root, "app.wxss"));
  for (const page of app.pages) component(appFile, "/" + page);
  component(appFile, "/custom-tab-bar/index");
  return {
    files: [...files],
    external: [...external],
    packages: [...packages],
  };
}
