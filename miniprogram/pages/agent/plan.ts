import { modelChoices, modelSettings } from "../create/models";
import { referenceSettings, creationMode } from "../create/references";
import type { Plan } from "../../utils/agent-plan";
import type { Model, Row, Asset, Input } from "../../services/types";

// The generation request for a plan: the first model (in the admin's order)
// that takes the referenced materials, snapped to its nearest supported
// length and ratio. Only materials the prompt mentions are sent.
export function planInput(plan: Plan, models: Model[], assets: Row<Asset>[], session: string): Input {
  const used = assets.filter((_, i) => {
    const kind = assets[i].data.type.startsWith("image/") ? "图片" : "视频";
    const n = assets.slice(0, i + 1).filter((a) => a.data.type.startsWith(assets[i].data.type.split("/")[0])).length;
    return plan.prompt.includes(`@${kind}${n}`);
  });
  const needs = { image: used.some((a) => a.data.type.startsWith("image/")), video: used.some((a) => a.data.type.startsWith("video/")) };
  const choices = modelChoices(models, plan.kind);
  const fits = (m: (typeof choices)[number]) => {
    const r = referenceSettings(m);
    return (!needs.image || r.allowImage) && (!needs.video || r.allowVideo);
  };
  const model = choices.find(fits);
  if (!model) throw new Error(choices.length ? "暂无支持这些素材的模型，请减少素材引用后再试" : "暂无可用的生成模型");
  const s = modelSettings(model, { resolution: "", ratio: plan.ratio, duration: plan.kind === "video" ? plan.duration : 0, assets: used });
  return {
    kind: plan.kind, model: model.id, resolution: s.resolution, ratio: s.ratio, duration: plan.kind === "video" ? s.duration : 0,
    quality: s.quality, mode: creationMode(model, used), prompt: plan.prompt.slice(0, s.maxPromptChars), assets: used.map((a) => a.id), sessionId: session,
  } as Input;
}
