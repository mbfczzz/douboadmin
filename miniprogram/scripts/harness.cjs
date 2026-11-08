const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require(process.env.DOUBO_TYPESCRIPT_PATH || "typescript");
function harness(timers = {}) {
  const storage = new Map(),
    cache = new Map(),
    sent = [],
    nav = [];
  let loginCount = 0,
    capturedPage,
    capturedComponent;
  const ctx = { storage, sent, nav, pages: [], loginCount: () => loginCount };
  const wx = {
    getStorageSync: (k) => storage.get(k),
    setStorageSync: (k, v) => storage.set(k, v),
    removeStorageSync: (k) => storage.delete(k),
    navigateTo: (o) => nav.push(o),
    showToast() {},
    stopPullDownRefresh() {},
    login: async () => ({ code: "fresh-code-" + ++loginCount }),
    request: (o) => {
      sent.push(o);
      queueMicrotask(() =>
        o.success({
          statusCode: 200,
          data: {
            token: "opaque-token",
            userId: "wx-user",
            expiresIn: 86400,
            provider: "wechat",
            isNewUser: false,
          },
        }),
      );
    },
  };
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      reportDiagnostics: true,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    });
    assert.deepEqual(
      (compiled.diagnostics || []).map((d) =>
        ts.flattenDiagnosticMessageText(d.messageText, " "),
      ),
      [],
      `${file} must compile with TypeScript ${ts.version}`,
    );
    vm.runInNewContext(
      compiled.outputText,
      {
        module,
        exports: module.exports,
        wx,
        Date,
        Math,
        Promise,
        Error,
        console: timers.console || console,
        setTimeout: timers.setTimeout || setTimeout,
        clearTimeout: timers.clearTimeout || clearTimeout,
        getCurrentPages: () => ctx.pages,
        Page: (o) => {
          capturedPage = o;
        },
        Component: (o) => {
          capturedComponent = o;
        },
        setInterval: () => 1,
        clearInterval() {},
        require: (id) => load(path.resolve(path.dirname(file), id + ".ts")),
      },
      { filename: file },
    );
    if (file.endsWith(path.join("utils", "api.ts")))
      module.exports = { ...module.exports };
    cache.set(file, module.exports);
    return module.exports;
  }
  function page(name) {
    capturedPage = undefined;
    load(path.join(process.cwd(), "pages", name, "index.ts"));
    assert.ok(capturedPage);
    return {
      ...capturedPage,
      data: JSON.parse(JSON.stringify(capturedPage.data)),
      setData(v) {
        Object.assign(this.data, v);
      },
    };
  }
  function component(name) {
    capturedComponent = undefined;
    load(path.join(process.cwd(), name, "index.ts"));
    assert.ok(capturedComponent);
    return {
      ...capturedComponent.methods,
      pageLifetimes: capturedComponent.pageLifetimes || {},
      data: JSON.parse(JSON.stringify(capturedComponent.data)),
      setData(v) {
        Object.assign(this.data, v);
      },
    };
  }
  return {
    ...ctx,
    wx,
    page,
    component,
    api: load(path.join(process.cwd(), "utils/api.ts")),
  };
}

module.exports = { harness };
