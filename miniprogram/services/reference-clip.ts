import { request } from "./request";
import { loadConfig } from "../utils/config-cache";
import type { Model, Row, Asset } from "./types";

// 一键复刻 gives the video model the original video as @视频1, without its
// sound (which can fail the provider's content review). A model takes a
// reference video up to its limit (Seedance 2.0: 15 s, 2.5: 30 s;
// referenceRules.omni_ref.video.maxSeconds); a longer original cannot be
// remade, and the user is told so instead of getting a cut or failed result.
export const clipSeconds = (model: Model) => model.referenceRules?.omni_ref?.video?.maxSeconds || 15;
// The server sends omni_ref.video rules only for models taking reference videos.
const takesVideo = (m: Model) => m.kind === "video" && !!m.referenceRules?.omni_ref?.video;

// "" when the model takes an original this long; else why it cannot, naming a
// model that can when there is one.
export function lengthProblem(seconds: number, model: Model, models: Model[]) {
  const limit = clipSeconds(model);
  if (!seconds || seconds <= limit) return "";
  const other = models.find((m) => takesVideo(m) && seconds <= clipSeconds(m));
  return `原视频 ${Math.round(seconds)} 秒，${model.name} 最长只能参考 ${limit} 秒的视频，生成不了` + (other ? `，可换成 ${other.name}` : "，请换一条 " + limit + " 秒以内的视频");
}

// The longest original any offered video model takes (0: none takes video).
export async function longestReference() {
  const models = (await loadConfig()).models.filter(takesVideo);
  return models.reduce((n, m) => Math.max(n, clipSeconds(m)), 0);
}

// The original without its sound (the whole of it: it is within the limit).
export async function referenceClip(id: string, model: Model) {
  const row = await request<Row<Asset>>(`/assets/${encodeURIComponent(id)}/reference-clip`, "POST", { seconds: clipSeconds(model) });
  return row.id;
}
