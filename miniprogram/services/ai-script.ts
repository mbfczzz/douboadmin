import { request } from "./request";
import { submitInput } from "./jobs";
import type { Job } from "./types";
import { chatModel } from "./chat-model";

// "AI写剧本": asks the chat model (the one Agent uses) and waits for its
// reply. It is an ordinary chat task, priced and confirmed like any other.
const WAIT_MS = 2000;
const GIVE_UP_MS = 3 * 60 * 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function writeScript(instruction: string, alive: () => boolean = () => true) {
  const model = await chatModel();
  let job = await submitInput({ kind: "chat", model: model.id, prompt: instruction, resolution: "", ratio: "", duration: 0, assets: [] }, "script");
  const started = Date.now();
  while (job.status === "queued" || job.status === "running") {
    if (Date.now() - started > GIVE_UP_MS) throw new Error("剧本还在生成，可稍后在 Agent 里查看");
    await sleep(WAIT_MS);
    if (!alive()) return "";
    job = await request<Job>("/jobs/" + job.id);
  }
  if (job.status !== "succeeded" || !job.result) throw new Error(job.error || "剧本生成失败，请重试");
  return job.result.trim();
}
