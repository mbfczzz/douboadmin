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

// Labels for the change summary of a model save.
export const modelFieldLabels: Record<string, string> = {
  description: "描述",
  icon: "图标",
  costUsd: "成本价（USD）",
  estSeconds: "预计耗时（秒）",
  badges: "模型标签",
  modes: "生成方式",
  resolutions: "支持清晰度",
  ratios: "支持比例",
  qualities: "支持画质",
  durations: "支持时长",
  maxRefImages: "最大参考图数量",
  maxRefImageSizeMB: "参考图大小上限（MB）",
  refLimits: "参考素材限制",
  omniReferences: "全能参考素材",
  defaultPrompt: "默认提示词",
  ideas: "灵感提示词",
  maxPromptChars: "提示词字数上限",
  videoBillingMode: "视频计费方式",
  priceMatrix: "积分定价",
  pricePerRequestByResolution: "按次定价",
  errorHints: "错误提示映射",
  availabilityStatus: "运行状态",
  points: "基础积分",
  sort: "排序",
  published: "上架",
};
