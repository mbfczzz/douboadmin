import { error, isNavigating, openTask, submitInput } from "../../utils/api";
import { referenceError, selectedModel } from "./references";
import { creationInput } from "./input";

import type { SubmitEditor as Editor } from "./editor-types";
export async function generate(page: Editor) {
  const data = page.data;
  if (data.busy || data.uploading || data.restoring || isNavigating(page))
    return;
  if (data.modelsLoading || data.modelError || !data.model) {
    error(new Error("请先加载并选择可用模型"));
    return;
  }
  if (data.restoreError) {
    error(new Error(data.restoreError));
    return;
  }
  const model = selectedModel(page);
  if (!model || data.parameterError) {
    error(new Error(data.parameterError || "请先选择可用模型"));
    return;
  }
  const problem = referenceError(model, data.assets, true);
  if (problem) {
    error(new Error(problem));
    return;
  }
  if (Array.from(data.prompt).length > data.maxPromptChars) {
    error(new Error("此模型最多支持 " + data.maxPromptChars + " 字"));
    return;
  }
  if (!data.prompt.trim()) {
    error(new Error("先描述你想创作的画面"));
    return;
  }
  page.setData({ busy: true });
  try {
    const job = await submitInput(creationInput(data, model), "create");
    if (page.visible) openTask(job.id, page);
    else wx.showToast({ title: "任务已加入队列", icon: "success" });
  } catch (e) {
    error(e);
  } finally {
    if (!page.destroyed) page.setData({ busy: false });
  }
}
