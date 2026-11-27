import { request } from "./request";
import { uid } from "./ids";
import type { Job } from "./types";
import type { Breakdown } from "./hot-breakdown";

// 一键复刻 runs as a task in the queue: the server saves the original without
// watermark into the user's materials and breaks it down (hook, shots,
// selling points). When it is done, the task page hands it to the editor's
// 一键复刻 preset (pages/create/feature.ts writes the description).

// What 一键复刻 hands the editor about the original.
export type RemakeSource = {
  title: string;
  text: string;
  duration: number;
  breakdown?: Breakdown | null; // the video model's reading, when available
  images?: number; // the user's own product / person pictures, @图片1…
  // Which subject each picture replaces (@图片N in order); when set, only
  // these swaps are written, the other subjects stay as they are.
  swaps?: Swap[];
};
export type Swap = { name: string; kind: string; look: string; ref: string };
export const REMAKE_SOURCE_KEY = "remake-source";

export type RemakeOriginal = { title: string; text: string; duration: number };

export function startRemake(videoId: string, original: RemakeOriginal, pictures: string[]) {
  return request<Job>("/hot/videos/" + videoId + "/import", "POST", {
    purpose: "remake",
    assets: pictures,
    title: original.title,
    text: original.text.slice(0, 500),
    duration: Math.round(original.duration) || 0,
  }, uid());
}

// 一键复刻 from the user's own uploaded video (instead of a Douyin one): the
// same preparation task, without the download.
export function startUploadRemake(videoAssetId: string, original: { title: string; duration: number }, pictures: string[]) {
  return request<Job>("/remake/upload", "POST", {
    video: videoAssetId,
    assets: pictures,
    title: original.title,
    duration: Math.round(original.duration) || 0,
  }, uid());
}

// The task keeps "一键复刻：title" then the caption in its prompt.
export function remakeOriginal(job: Job): RemakeOriginal {
  const [first, ...rest] = (job.input.prompt || "").split("\n");
  return { title: first.replace(/^一键复刻：/, ""), text: rest.join("\n"), duration: job.input.duration || 0 };
}

// 生成同款's description, written by the server from the remake task and its
// breakdown (the wording changes there, without a mini-program release),
// with the original's size (0 when it could not be read).
export type RemakeBrief = { prompt: string; width: number; height: number };
export function remakeBrief(job: string, seconds: number, limit: number, images: number, swaps: Swap[]) {
  const picture = (s: Swap) => Number(s.ref.replace("@图片", ""));
  const body = { job, seconds, limit, images, swaps: swaps.map((s) => ({ name: s.name, picture: picture(s) })) };
  return request<RemakeBrief>("/remake/prompt", "POST", body);
}

// Opens the editor's preset with the saved video (@视频1) and pictures (@图片N).
export function remakeHandoff(job: Job, breakdown: Breakdown | null, chosen?: { swaps: Swap[]; pictures: string[] }, ratio = "9:16") {
  const original = remakeOriginal(job);
  const pictures = chosen ? chosen.pictures : job.input.assets || [];
  const refs = pictures.map((_, i) => "@图片" + (i + 1)).join("、");
  const swap = chosen?.swaps.length
    ? "，" + chosen.swaps.map((s) => `把${s.name}换成${s.ref}`).join("，")
    : refs ? `，并把原视频中的商品或人物换成${refs}中的商品或人物` : "";
  const source: RemakeSource = { ...original, breakdown, images: pictures.length, swaps: chosen?.swaps };
  wx.setStorageSync(REMAKE_SOURCE_KEY, source);
  wx.setStorageSync("edit-draft", {
    kind: "video",
    prompt: `参考@视频1的画面内容、镜头运动和节奏，复刻一条同款视频${swap}。视频主题：${original.title}`,
    ratio,
    resolution: "",
    duration: Math.round(original.duration) || 5,
    assets: [job.resultAssetId, ...pictures],
  });
}
