const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { harness } = require("./harness.cjs");

const input = { kind: "image", model: "m", prompt: "测试内容", assets: [] };

test("managed job errors show stable code while preserving server user message and action", () => {
  const h = harness();
  const view = h.api.jobView({ id:"j", userId:"u", input, status:"failed", progress:100,
    error:"内容未通过安全审核，请调整提示词或参考素材。", errorCode:5002,
    errorAction:"调整提示词或参考素材，不要原样重试。", editable:true,
    retryable:false, demo:false, attempts:1, createdAt:"2026-11-16T00:00:00Z", updatedAt:"2026-11-16T00:00:00Z" });
  assert.equal(view.error,"内容未通过安全审核，请调整提示词或参考素材。（错误码 5002）");
  assert.equal(view.errorAction,"调整提示词或参考素材，不要原样重试。");
  assert.equal(view.retryable,false);
  assert.equal(h.api.jobView(view).error, view.error);
  assert.equal(view.editable,true);
});

test("legacy and unknown failures retain their original safe fallback", () => {
  const h = harness();
  const view = h.api.jobView({ id:"j", userId:"u", input, status:"failed", progress:100,
    error:"生成服务暂时不可用", demo:false, attempts:1,
    createdAt:"2026-11-16T00:00:00Z", updatedAt:"2026-11-16T00:00:00Z" });
  assert.equal(view.error,"生成服务暂时不可用");
  assert.equal(view.errorAction,undefined);
  assert.equal(view.editable,true);
});

test("do-not-regenerate codes hide both retry paths but keep their guidance", () => {
  const h = harness();
  const view = h.api.jobView({ id:"j", userId:"u", input, status:"failed", progress:100,
    error:"生成结果保存失败，请联系管理员，勿重新生成。", errorCode:5010,
    errorAction:"联系管理员恢复归档，不要重新生成。", editable:false,
    retryable:false, demo:false, attempts:1,
    createdAt:"2026-11-16T00:00:00Z", updatedAt:"2026-11-16T00:00:00Z" });
  assert.equal(view.retryable,false);
  assert.equal(view.editable,false);
  assert.match(view.errorAction,/不要重新生成/);
});

test("task detail renders handling guidance; queue cards stay short", () => {
  const detail = fs.readFileSync("pages/task-detail/index.wxml","utf8");
  const list = fs.readFileSync("pages/tasks/index.wxml","utf8");
  assert.match(detail,/job\.errorAction/);
  assert.match(detail,/job\.editable/);
  assert.match(detail,/class="muted small"/);
  // The reason lives on task detail; queue cards only link to it.
  assert.doesNotMatch(list,/item\.error/);
  assert.match(list,/查看原因 ›/);
});

test("editing a failed recipe returns to its template with model selection", () => {
  const h = harness(), page = h.page("task-detail");
  page.setData({ job: { input: { ...input, templateId: "recipe-a", prompt: "" } } });
  page.edit();
  assert.equal(h.nav.at(-1).url, "/pages/template-detail/index?id=recipe-a");
  assert.equal(h.storage.has("edit-draft"), false);
  const detail = fs.readFileSync("pages/task-detail/index.wxml", "utf8");
  assert.match(detail, /job\.input\.templateId\?'已使用模板提示词'/);
});
