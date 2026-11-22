import type { Model, Row, Asset } from "../../services/types";
import { media } from "../../services/media";
import { referenceSettings, creationMode } from "./references";

import type { ModelChoice } from "./editor-types";

export function modelChoices(models: Model[], kind: string): ModelChoice[] {
  return models
    .filter((model) =>
      model.kind === kind &&
      (kind === "chat" || !/^(ark|deepseek):/.test(model.key || "")),
    )
    .map((model) => ({
      ...model,
      icon: model.icon && !/^(https?:|\/)/i.test(model.icon) ? model.icon : "",
      label: model.name,
      description: model.settings?.description || "",
      estimate: model.settings?.estSeconds
        ? "约 " + model.settings.estSeconds + " 秒"
        : "",
      iconURL:
        model.icon &&
        (/^https?:\/\//i.test(model.icon) || /^\/(?!\/)/.test(model.icon))
          ? media(model.icon)
          : "",
      badges: (model.settings?.badges || []).map((b, i) => ({
        ...b,
        id: String(i),
      })),
    }));
}

export const defaultPromptChars = (kind: string) => kind === "image" ? 2000 : 20000;
const matching = (values: string[], value = "") => values.find((v) => v.toLowerCase() === value.toLowerCase());
const highest = (values: string[], order: string[]) => order.map((key) => matching(values, key)).find(Boolean) || values[0] || "";

export function modelSettings(
  model: ModelChoice,
  current: {
    model?: string;
    resolutionChosen?: boolean;
    qualityChosen?: boolean;
    resolution: string;
    ratio: string;
    duration?: number;
    quality?: string;
    prompt?: string;
    assets?: Row<Asset>[];
  },
) {
  const durations = [...new Set(model.durations || [])].filter((n) => Number.isInteger(n) && n >= 1 && n <= 30).sort((a, b) => a - b);
  // An unsupported length (a draft, a remade video) takes the closest one.
  const wanted = current.duration || 0;
  const duration = durations.includes(wanted)
    ? wanted
    : durations.reduce((best, n) => (Math.abs(n - wanted) < Math.abs(best - wanted) ? n : best), durations[0] || 0);
  const qualities = model.qualities || [];
  const chosenQuality = matching(qualities, current.quality);
  const keepQuality = !model.settings?.hideQuality && !!chosenQuality &&
    (model.kind !== "image" || (current.model === model.id && current.qualityChosen));
  const prompt = current.prompt || model.settings?.defaultPrompt || "";
  return {
    prompt,
    hasPrompt: !!prompt.trim(),
    maxPromptChars: model.settings?.maxPromptChars || defaultPromptChars(model.kind),
    ...referenceSettings(model),
    durations,
    duration,
    durationIndex: Math.max(0, durations.indexOf(duration)),
    qualities: model.settings?.hideQuality ? [] : qualities,
    qualityNames: qualities.reduce<Record<string, string>>((names, value) => {
      names[value] = ({ low: "低", medium: "中", high: "高" } as Record<string, string>)[value.toLowerCase()] || value;
      return names;
    }, {}),
    qualityChosen: !!keepQuality && model.kind === "image",
    quality: keepQuality
      ? chosenQuality || ""
      : model.kind === "image" ? highest(qualities, ["high", "medium", "low"]) : qualities[0] || "",
    model: model.id,
    modelName: model.label,
    ...resolutionSettings(model, current),
    ratios: model.ratios,
    ratio: model.ratios.includes(current.ratio)
      ? current.ratio
      : model.ratios[0] || "",
  };
}

export function resolutionSettings(
  model: Model,
  current: { model?: string; resolutionChosen?: boolean; resolution: string; assets?: Row<Asset>[] },
) {
  const restricted =
    model.resolutionByMode?.[creationMode(model, current.assets || [])];
  const resolutions =
    restricted === undefined
      ? model.resolutions
      : restricted.filter(
          (v) => !model.resolutions.length || model.resolutions.includes(v),
        );
  const chosen = matching(resolutions, current.resolution);
  const keep = !model.settings?.hideResolution && !!chosen &&
    (model.kind !== "image" || (current.model === model.id && current.resolutionChosen));
  return {
    resolutionChosen: !!keep && model.kind === "image",
    resolutions: model.settings?.hideResolution ? [] : resolutions,
    resolution: keep
      ? chosen || ""
      : model.kind === "image" ? highest(resolutions, ["4k", "2k", "1k"]) : resolutions[0] || "",
    parameterError:
      restricted !== undefined && !resolutions.length
        ? "当前素材对应的生成方式没有可用分辨率，请调整素材或更换模型"
        : "",
  };
}

// Shown when the chosen kind has no model to offer.
export const NO_MODELS = {
  model: "",
  modelName: "暂无可用模型",
  availableModels: [],
  resolutions: [],
  ratios: [],
  durations: [],
  qualities: [],
  allowImage: false,
  allowVideo: false,
  allowAudio: false,
  maxReferences: 0,
  parameterError: "",
  modelError: "当前类型暂无可用模型",
};
