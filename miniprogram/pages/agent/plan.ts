import { modelChoices, modelSettings } from "../create/models";
import { referenceSettings, creationMode } from "../create/references";
import type { Plan } from "../../utils/agent-plan";
import type { Model, Row, Asset, Input } from "../../services/types";

const labelOf = (type: string) => (type.startsWith("image/") ? "图片" : "视频");

// The text a plan generates from (and 去编辑页精调 shows): its prompt, plus
// the shots — time, scene, material, 台词 — when the prompt does not already
// carry them (models often keep it short and leave the lines to the shots).
export function planPrompt(plan: Plan): string {
  if (!plan.shots.length) return plan.prompt;
  const covered = plan.shots.every((s) => !s.time || plan.prompt.includes(s.time.replace(/秒$/, "")));
  const spoken = plan.shots.every((s) => !s.line || plan.prompt.includes(s.line));
  if (covered && spoken) return plan.prompt;
  const shots = plan.shots.map((s) => `${s.time ? s.time + "：" : ""}${s.scene}${s.asset ? `（用@${s.asset}）` : ""}${s.line ? `，台词：“${s.line}”` : ""}`);
  return `${plan.prompt}\n分镜：\n${shots.join("\n")}`;
}

// Only the materials the prompt mentions are sent, and a model numbers its
// references by what it receives. So the mentions are renumbered to match
// (the project's 图片2 alone becomes @图片1), and a mention of a material the
// project does not have loses its @ rather than pointing at nothing.
export function sentMaterials(prompt: string, assets: Row<Asset>[]) {
  const counts: Record<string, number> = {};
  const named = assets.map((a) => {
    const kind = labelOf(a.data.type);
    counts[kind] = (counts[kind] || 0) + 1;
    return { asset: a, kind, name: kind + counts[kind] };
  });
  const mentioned = (name: string) => new RegExp(`@${name}(?!\\d)`).test(prompt);
  const used = named.filter((m) => mentioned(m.name));
  const renamed: Record<string, string> = {};
  const next: Record<string, number> = {};
  for (const m of used) renamed[m.name] = m.kind + (next[m.kind] = (next[m.kind] || 0) + 1);
  const text = prompt.replace(/@(图片|视频)(\d+)/g, (whole, kind: string, n: string) => (renamed[kind + n] ? "@" + renamed[kind + n] : kind + n));
  return { assets: used.map((m) => m.asset), prompt: text };
}

// The generation request for a plan: the first model (in the admin's order)
// that takes the referenced materials, snapped to its nearest supported
// length and ratio.
// The models of the plan's kind that take the materials it uses (the 确认生成 choices).
export function planModels(plan: Plan, models: Model[], assets: Row<Asset>[]) {
  const used = sentMaterials(planPrompt(plan), assets).assets;
  const needs = { image: used.some((a) => a.data.type.startsWith("image/")), video: used.some((a) => a.data.type.startsWith("video/")) };
  return modelChoices(models, plan.kind).filter((m) => {
    const r = referenceSettings(m);
    return (!needs.image || r.allowImage) && (!needs.video || r.allowVideo);
  });
}

// chosen: the model picked on the plan card, else the first that fits.
export function planInput(plan: Plan, models: Model[], assets: Row<Asset>[], session: string, chosen = ""): Input {
  const sent = sentMaterials(planPrompt(plan), assets);
  const used = sent.assets;
  const fits = planModels(plan, models, assets);
  const model = fits.find((m) => m.id === chosen) || fits[0];
  if (!model) throw new Error(models.some((m) => m.kind === plan.kind) ? "暂无支持这些素材的模型，请减少素材引用后再试" : "暂无可用的生成模型");
  const s = modelSettings(model, { resolution: "", ratio: plan.ratio, duration: plan.kind === "video" ? plan.duration : 0, assets: used });
  return {
    kind: plan.kind, model: model.id, resolution: s.resolution, ratio: s.ratio, duration: plan.kind === "video" ? s.duration : 0,
    quality: s.quality, mode: creationMode(model, used), prompt: sent.prompt.slice(0, s.maxPromptChars), assets: used.map((a) => a.id), sessionId: session,
  } as Input;
}
