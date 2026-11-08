import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

export function collectBundle(directory) {
  const root = path.resolve(directory);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, ".vite/manifest.json"), "utf8"),
  );
  if (!manifest["index.html"])
    throw new Error("Missing manifest entry: index.html");
  const cache = new Map();
  function asset(file) {
    if (cache.has(file)) return cache.get(file);
    const absolute = path.resolve(root, file);
    if (
      !absolute.startsWith(root + path.sep) ||
      !fs.statSync(absolute).isFile()
    ) {
      throw new Error(`Invalid bundle asset: ${file}`);
    }
    const buffer = fs.readFileSync(absolute);
    const value = {
      file,
      bytes: buffer.length,
      gzipBytes: gzipSync(buffer).length,
    };
    cache.set(file, value);
    return value;
  }
  function closure(start) {
    const visited = new Set(),
      files = new Set();
    function visit(key) {
      if (visited.has(key)) return;
      visited.add(key);
      const item = manifest[key];
      if (!item?.file) throw new Error(`Missing manifest dependency: ${key}`);
      files.add(item.file);
      for (const css of item.css || []) files.add(css);
      for (const dependency of item.imports || []) visit(dependency);
    }
    visit(start);
    return files;
  }
  const sum = (files, extension, field) =>
    [...files]
      .filter((f) =>
        extension === ".js" ? /\.[cm]?js$/.test(f) : f.endsWith(extension),
      )
      .reduce((total, f) => total + asset(f)[field], 0);
  function sizes(files) {
    return {
      jsBytes: sum(files, ".js", "bytes"),
      jsGzipBytes: sum(files, ".js", "gzipBytes"),
      cssBytes: sum(files, ".css", "bytes"),
      cssGzipBytes: sum(files, ".css", "gzipBytes"),
    };
  }
  const initialFiles = closure("index.html"),
    initial = sizes(initialFiles);
  const dynamic = new Set();
  for (const [key, item] of Object.entries(manifest)) {
    if (item.isDynamicEntry) dynamic.add(key);
    for (const dependency of item.dynamicImports || []) {
      if (!manifest[dependency])
        throw new Error(`Missing dynamic dependency: ${dependency}`);
      dynamic.add(dependency);
    }
  }
  const entries = {};
  const workspaceTargets = new Set(
    manifest["src/Workspace.tsx"]?.dynamicImports || [],
  );
  for (const key of [...dynamic].sort()) {
    const item = manifest[key];
    const source = item.src || (key.startsWith("src/") ? key : undefined);
    const id =
      source?.replaceAll("\\", "/") || (item.name && `chunk:${item.name}`);
    if (!id) throw new Error(`Missing stable lazy entry identity: ${key}`);
    if (entries[id]) throw new Error(`Duplicate lazy entry identity: ${id}`);
    const all = closure(key),
      additional = new Set([...all].filter((f) => !initialFiles.has(f)));
    const kind =
      /src\/pages\//.test(id) || (!source && workspaceTargets.has(key))
        ? "page"
        : id === "src/Workspace.tsx"
          ? "shell"
          : "lazy";
    entries[id] = {
      kind,
      file: item.file,
      ...sizes(additional),
      eagerlyLoaded: kind !== "lazy" && initialFiles.has(item.file),
      assets: [...additional]
        .map(asset)
        .sort((a, b) => b.gzipBytes - a.gzipBytes),
    };
  }
  const allFiles = new Set();
  function scan(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) scan(file);
      else if (/\.([cm]?js|css)$/.test(item.name))
        allFiles.add(path.relative(root, file).replaceAll(path.sep, "/"));
    }
  }
  scan(root);
  const total = sizes(allFiles);
  return {
    schemaVersion: 2,
    initialJSBytes: initial.jsBytes,
    initialJSGzipBytes: initial.jsGzipBytes,
    initialCSSBytes: initial.cssBytes,
    initialCSSGzipBytes: initial.cssGzipBytes,
    totalJSBytes: total.jsBytes,
    totalJSGzipBytes: total.jsGzipBytes,
    totalCSSBytes: total.cssBytes,
    totalCSSGzipBytes: total.cssGzipBytes,
    lazyJSGzipBytes: total.jsGzipBytes - initial.jsGzipBytes,
    chunks: allFiles.size,
    entries,
    initialAssets: [...initialFiles]
      .map(asset)
      .sort((a, b) => b.gzipBytes - a.gzipBytes),
  };
}
