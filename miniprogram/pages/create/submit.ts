import { rememberRows } from "../../utils/view-cache";
import { error, isNavigating, openTask, submitInput } from "../../utils/api";
import { referenceError, selectedModel } from "./references";
import { creationInput } from "./input";
import { featureProblem } from "./feature";
import { referenceClip, lengthProblem } from "../../services/reference-clip";
import { loadConfig } from "../../utils/config-cache";

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
  const problem = referenceError(model, data.assets, true) || featureProblem(data);
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
    const input = creationInput(data, model);
    // 一键复刻: an original longer than the model takes cannot be remade;
    // otherwise it goes without its sound.
    if (data.feature === "remake") {
      const tooLong = lengthProblem(data.remakeSource?.duration || 0, model, (await loadConfig()).models);
      if (tooLong) throw new Error(tooLong);
      input.assets = await Promise.all(input.assets.map((id) => (data.assets.find((a) => a.id === id)?.isVideo ? referenceClip(id, model) : id)));
    }
    const job = await submitInput(input, "create");
    rememberRows([job]); // task detail paints it at once
    if (page.visible) openTask(job.id, page);
    else wx.showToast({ title: "任务已加入队列", icon: "success" });
  } catch (e) {
    error(e);
  } finally {
    if (!page.destroyed) page.setData({ busy: false });
  }
}
