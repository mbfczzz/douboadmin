import type { Model } from "../api";

// The model's settings are edited one part at a time, each from its own row
// button, so a dialog only ever shows one concern.
export const modelSections = {
  basic: { button: "基础信息", title: "基础信息" },
  capabilities: { button: "生成能力", title: "生成能力" },
  prompt: { button: "提示词", title: "提示词配置" },
  pricing: { button: "定价", title: "积分定价" },
  status: { button: "状态", title: "状态与错误提示" },
} as const;
export type ModelSection = keyof typeof modelSections;

// Chat models have no price matrix.
export const sectionsFor = (model: Model) =>
  (Object.keys(modelSections) as ModelSection[]).filter(
    (key) =>
      key !== "pricing" || model.kind === "image" || model.kind === "video",
  );
