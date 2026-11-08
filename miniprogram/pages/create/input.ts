import type { Input, Model } from "../../services/types";
import type { EstimateInput } from "../../services/estimate";
import type { creationData } from "./state";
import { creationMode } from "./references";

export function pricingInput(data: typeof creationData): EstimateInput {
  return {
    kind: data.kind,
    model: data.model,
    resolution: data.resolution,
    quality: data.quality,
    ratio: data.ratio,
    duration: data.kind === "video" ? data.duration : 0,
  };
}
export function creationInput(data: typeof creationData, model: Model): Input {
  return {
    ...pricingInput(data),
    prompt: data.prompt,
    mode: creationMode(model, data.assets),
    assets: data.assets.map((asset) => asset.id),
  };
}
