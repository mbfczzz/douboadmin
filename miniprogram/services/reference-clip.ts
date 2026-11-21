import { request } from "./request";
import type { Model, Row, Asset } from "./types";

// 一键复刻 gives the video model the original video as @视频1, cut on the
// server to the model's reference limit (Seedance 2.0: 15 s, 2.5: 30 s;
// referenceRules.omni_ref.video.maxSeconds) and without its sound, which can
// fail the provider's content review. Returns the asset id to send.
export const clipSeconds = (model: Model) => model.referenceRules?.omni_ref?.video?.maxSeconds || 15;

export async function referenceClip(id: string, model: Model) {
  const row = await request<Row<Asset>>(`/assets/${encodeURIComponent(id)}/reference-clip`, "POST", { seconds: clipSeconds(model) });
  return row.id;
}
