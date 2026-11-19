import { request } from "./request";
import { uid } from "./ids";
import type { Job } from "./types";

// Saves a Douyin video into the user's materials: the server downloads the
// original upload without watermark (or the clean play address) and returns
// the asset. `stage` reports the server's progress text.
const WAIT_MS = 2500;

// What 一键复刻 hands the editor about the original (pages/create/feature.ts
// turns it into a shot-by-shot description).
export type RemakeSource = {
  title: string;
  text: string;
  duration: number;
  breakdown?: import("./hot-breakdown").Breakdown | null; // the video model's reading, when available
  images?: number; // the user's own product / person pictures, @图片1…
};
export const REMAKE_SOURCE_KEY = "remake-source";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function importHotVideo(id: string, alive: () => boolean, stage: (text: string) => void) {
  let job = await request<Job>("/hot/videos/" + id + "/import", "POST", {}, uid());
  while (job.status !== "succeeded" || !job.resultAssetId) {
    if (job.status === "failed") throw new Error(job.error || "原视频获取失败，请重试");
    stage(job.stage || "正在获取无水印原视频");
    await sleep(WAIT_MS);
    if (!alive()) return "";
    job = await request<Job>("/jobs/" + job.id);
  }
  return job.resultAssetId;
}
