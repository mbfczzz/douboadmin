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

// Pictures need a model that sees them; videos one that takes them (the
// direct DeepSeek / 豆包 models: 豆包 watches, the others get 视频理解's notes).
const takes = (needs: "image" | "video" | "", m: Model) =>
  !needs || (m.referenceTypes || []).includes(needs) || (needs === "video" && /^(deepseek|doubao):/.test(m.key || ""));

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

export async function askChat(instruction: string, opts: { assets?: string[]; needs?: "image" | "video"; channel?: string; alive?: () => boolean } = {}) {
  const config = await loadConfig();
  const model = preferredChat(config.models.filter((m) => m.kind === "chat" && takes(opts.needs || "", m)));
  if (!model) throw new Error(opts.needs === "video" ? "暂无能看视频的对话模型" : "暂无能识别图片的对话模型");
  const job = await submitInput({ kind: "chat", model: model.id, prompt: instruction, resolution: "", ratio: "", duration: 0, assets: opts.assets || [] }, opts.channel || "ask");
  return waitFor(job, opts.alive || (() => true), "还在识别，可稍后在任务队列里查看");
}

export async function writeScript(instruction: string, alive: () => boolean = () => true) {
  const model = await chatModel();
  const job = await submitInput({ kind: "chat", model: model.id, prompt: instruction, resolution: "", ratio: "", duration: 0, assets: [] }, "script");
  return waitFor(job, alive, "剧本还在生成，可稍后在 Agent 里查看");
}
