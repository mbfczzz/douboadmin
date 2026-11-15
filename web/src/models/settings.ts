import type { Model } from "../api";
import {
  filterOptions,
  imageQualities,
  imageResolutions,
  parameterRatios,
  videoResolutions,
  videoDurations,
} from "./parameter-options";

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
  medium: "中画质",
  high: "高画质",
};

export function effectiveModel(m: Model): Model {
  const s = m.settings || {};
  const choose = <T>(all: T[] | null | undefined, selection?: T[]) =>
    selection?.length ? [...selection] : all || [];
  const resolutions = choose(m.resolutions, s.resolutions),
    qualities = choose(m.qualities, s.qualities),
    ratios = choose(m.ratios, s.ratios),
    durations = choose(m.durations, s.durations),
    visual = m.kind === "image" || m.kind === "video";
  return {
    ...m,
    modes: s.modes?.length
      ? (m.modes || []).filter((v) => s.modes!.includes(v))
      : m.modes || [],
    resolutions: visual
      ? filterOptions(
          resolutions,
          m.kind === "video" ? videoResolutions : imageResolutions,
        )
      : resolutions,
    ratios: visual ? filterOptions(ratios, parameterRatios) : ratios,
    qualities:
      m.kind === "image" ? filterOptions(qualities, imageQualities) : qualities,
    durations:
      m.kind === "video"
        ? videoDurations.filter((v) => durations.includes(v))
        : durations,
  };
}

export function modelDraft(m: Model): ModelDraft {
  const e = effectiveModel(m);
  return {
    ...m,
    modes: m.modes || [],
    resolutions: m.resolutions || [],
    ratios: m.ratios || [],
    qualities: m.qualities || [],
    durations: m.durations || [],
    referenceTypes: m.referenceTypes || [],
    settings: {
      ...m.settings,
      modes: e.modes,
      resolutions: m.settings?.hideResolution ? [] : e.resolutions,
      ratios: e.ratios,
      qualities: m.settings?.hideQuality ? [] : e.qualities,
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
      settings[key] =
        key === "priceMatrix" || key === "pricePerRequestByResolution"
          ? mergePriceChanges(base.settings[key], value, latest.settings[key])
          : value;
  return out;
}

// Rebase only changed price cells, including explicit zero and cleared cells.
// Other editors' prices and newly added tiers must survive a conflict retry.
function mergePriceChanges(
  base: unknown,
  edited: unknown,
  latest: unknown,
): Record<string, unknown> {
  const object = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  const b = object(base),
    e = object(edited),
    out = { ...object(latest) };
  for (const key of new Set([...Object.keys(b), ...Object.keys(e)])) {
    if (JSON.stringify(b[key]) === JSON.stringify(e[key])) continue;
    if (typeof b[key] === "object" || typeof e[key] === "object")
      out[key] = mergePriceChanges(b[key], e[key], out[key]);
    else if (e[key] === undefined) delete out[key];
    else out[key] = e[key];
  }
  return out;
}
