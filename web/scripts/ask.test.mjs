import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/confirm/ask.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
}).outputText;
let instance = 0;
async function broker() {
  const api = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}#${instance++}`
  );
  let shown;
  const dispose = api.bindAsk((options) => {
    shown = options;
  });
  return { ...api, dispose, shown: () => shown };
}

test("aborting an originating view cancels its ask and removes its listener", async () => {
  const b = await broker(),
    controller = new AbortController();
  const first = { title: "第一次确认", signal: controller.signal };
  const result = b.ask(first);
  assert.equal(b.shown(), first);
  controller.abort();
  assert.equal(await result, false);
  assert.equal(b.shown(), undefined);
  const next = { title: "新确认" },
    pending = b.ask(next);
  controller.abort();
  assert.equal(b.shown(), next);
  b.finishAsk("", next);
  assert.equal(await pending, "");
  assert.equal(await b.ask(first), false);
  b.dispose();
});

test("a superseded ask cannot resolve or close the current request", async () => {
  const b = await broker(),
    old = { title: "旧确认" },
    next = { title: "新确认" };
  const original = b.ask(old),
    current = b.ask(next);
  assert.equal(await original, false);
  b.finishAsk("", old);
  assert.equal(b.shown(), next);
  b.finishAsk("已确认", next);
  assert.equal(await current, "已确认");
  b.dispose();
});

test("a previously confirmed async action finishing cannot close a newer dialog", async () => {
  const b = await broker(),
    controller = new AbortController();
  let complete;
  const old = {
    title: "旧提交",
    signal: controller.signal,
    run: () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  };
  const original = b.ask(old),
    write = old.run();
  controller.abort();
  assert.equal(await original, false);
  const next = { title: "另一项操作" },
    current = b.ask(next);
  complete();
  await write;
  b.finishAsk("", old);
  assert.equal(b.shown(), next);
  b.finishAsk(false, next);
  assert.equal(await current, false);
  b.dispose();
});
