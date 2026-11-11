import type { Model, Row, Asset } from "../../services/types";
import { media } from "../../services/media";
import { referenceSettings, creationMode } from "./references";

export type ModelChoice = Model & {
  label: string;
  description: string;
  estimate: string;
  iconURL: string;
  badges: { text: string; tone: string; id: string }[];
};

export function modelChoices(models: Model[], kind: string): ModelChoice[] {
  return models
    .filter((model) => model.kind === kind)
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

export function modelSettings(
  model: ModelChoice,
  current: {
    resolution: string;
    ratio: string;
    duration?: number;
    quality?: string;
    prompt?: string;
    assets?: Row<Asset>[];
  },
) {
  const durations = model.durations || [];
  const duration = durations.includes(current.duration || 0)
    ? current.duration || 0
    : durations[0] || 0;
  const qualities = model.qualities || [];
  const prompt = current.prompt || model.settings?.defaultPrompt || "";
  return {
    prompt,
    hasPrompt: !!prompt.trim(),
    ideas: model.settings?.ideas || [],
    maxPromptChars: model.settings?.maxPromptChars || 500,
    ...referenceSettings(model),
    durations,
    duration,
    durationIndex: Math.max(0, durations.indexOf(duration)),
    qualities,
    quality: qualities.includes(current.quality || "")
      ? current.quality || ""
      : qualities[0] || "",
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
  current: { resolution: string; assets?: Row<Asset>[] },
) {
  const restricted =
    model.resolutionByMode?.[creationMode(model, current.assets || [])];
  const resolutions =
    restricted === undefined
      ? model.resolutions
      : restricted.filter(
          (v) => !model.resolutions.length || model.resolutions.includes(v),
        );
  return {
    resolutions,
    resolution: resolutions.includes(current.resolution)
      ? current.resolution
      : resolutions[0] || "",
    parameterError:
      restricted !== undefined && !resolutions.length
        ? "当前素材对应的生成方式没有可用分辨率，请调整素材或更换模型"
        : "",
  };
}
