import type { Model } from "../api";

import type { ModelSettings } from "./types";
export type { ModelSettings } from "./types";
export type ModelDraft = Model & { settings: ModelSettings };
export type SettingsProps = {
  model: ModelDraft;
  onChange: (patch: Partial<ModelSettings>) => void;
};
export const modelKinds: Record<string, string> = {
  chat: "文本",
  image: "图片",
  video: "视频",
  audio: "音频",
  "3d": "3D",
  upscale: "超分",
};
export const supportedModel = (m: Model) =>
  ["chat", "image", "video"].includes(m.kind) ||
  (m.kind === "audio" && m.key.startsWith("tts-"));
export const modeLabels: Record<string, string> = {
  t2i: "文生图",
  i2i: "图生图",
  t2v: "文生视频",
  i2v: "图生视频",
  keyframe: "首尾帧",
  omni_ref: "全能参考",
  agentic: "智能视频",
  t2a: "音乐生成",
  sfx: "音效生成",
  t2_3d: "3D 生成",
  v_upscale: "视频超分",
};
export const qualityLabels: Record<string, string> = {
  low: "低画质",
  medium: "标准画质",
  high: "高画质",
};

export function effectiveModel(m: Model): Model {
  const s = m.settings || {};
  const choose = <T>(all: T[], selection?: T[]) =>
    selection?.length ? all.filter((v) => selection.includes(v)) : all;
  return {
    ...m,
    modes: choose(m.modes, s.modes),
    resolutions: choose(m.resolutions, s.resolutions),
    ratios: choose(m.ratios, s.ratios),
    qualities: choose(m.qualities, s.qualities),
    durations: choose(m.durations || [], s.durations),
  };
}

export function modelDraft(m: Model): ModelDraft {
  const e = effectiveModel(m);
  return {
    ...m,
    settings: {
      ...m.settings,
      modes: e.modes,
      resolutions: e.resolutions,
      ratios: e.ratios,
      qualities: e.qualities,
      durations: e.durations,
    },
  };
}

// After a version conflict: start from the latest record and re-apply only
// the fields this dialog changed, so other parts edited elsewhere survive.
export function rebaseDraft(
  base: ModelDraft,
  edited: ModelDraft,
  latest: ModelDraft,
): ModelDraft {
  const same = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);
  const out: ModelDraft = { ...latest, settings: { ...latest.settings } };
  const top = out as unknown as Record<string, unknown>,
    settings = out.settings as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(edited))
    if (key !== "settings" && !same(value, base[key as keyof ModelDraft]))
      top[key] = value;
  for (const [key, value] of Object.entries(edited.settings))
    if (!same(value, base.settings[key as keyof ModelSettings]))
      settings[key] = value;
  return out;
}
