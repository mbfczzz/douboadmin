import { request } from "./request";
import { submitInput } from "./jobs";
import type { Job, Model } from "./types";
import { chatModel, preferredChat } from "./chat-model";
import { loadConfig } from "../utils/config-cache";

// A chat model's answer, waited for: "AI写剧本" (writeScript) and 文案提取
// from a picture or a video (askChat with the file). Ordinary chat tasks,
// priced and confirmed like any other.
const WAIT_MS = 2000;
const GIVE_UP_MS = 3 * 60 * 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Pictures need a model that sees them. Any direct chat model may receive a
// video: the server watches it once with 视频理解 and reuses the text note.
const takes = (needs: "image" | "video" | "", m: Model) =>
  !needs || (m.referenceTypes || []).includes(needs) || (needs === "video" && /^(deepseek|ark):/.test(m.key || ""));

// The chat models offered for a step (model-picker), the usual one first.
export function chatChoices(models: Model[], needs: "image" | "video" | "" = "") {
  const list = models.filter((m) => m.kind === "chat" && takes(needs, m));
  const first = preferredChat(list);
  return first ? [first, ...list.filter((m) => m !== first)] : [];
}

async function waitFor(job: Job, alive: () => boolean, slow: string) {
  const started = Date.now();
  while (job.status === "queued" || job.status === "running") {
    if (Date.now() - started > GIVE_UP_MS) throw new Error(slow);
    await sleep(WAIT_MS);
    if (!alive()) return "";
    job = await request<Job>("/jobs/" + job.id);
  }
  if (job.status !== "succeeded" || !job.result) throw new Error(job.error || "生成失败，请重试");
  return job.result.trim();
}

// model: the one picked on the page; one that cannot take this file gives way to the usual.
export async function askChat(instruction: string, opts: { assets?: string[]; needs?: "image" | "video"; channel?: string; alive?: () => boolean; model?: string } = {}) {
  const list = chatChoices((await loadConfig()).models, opts.needs || "");
  const model = list.find((m) => m.id === opts.model) || list[0];
  if (!model) throw new Error(opts.needs === "video" ? "暂无能看视频的对话模型" : "暂无能识别图片的对话模型");
  const job = await submitInput({ kind: "chat", model: model.id, prompt: instruction, resolution: "", ratio: "", duration: 0, assets: opts.assets || [] }, opts.channel || "ask");
  return waitFor(job, opts.alive || (() => true), "还在识别，可稍后在任务队列里查看");
}

export async function writeScript(instruction: string, alive: () => boolean = () => true, chosen?: string) {
  const model = await chatModel(chosen);
  const job = await submitInput({ kind: "chat", model: model.id, prompt: instruction, resolution: "", ratio: "", duration: 0, assets: [] }, "script");
  return waitFor(job, alive, "剧本还在生成，可稍后在 Agent 里查看");
}
