import type { Job } from "../services/types";

export interface ChatMessage {
  id: string;
  role: string;
  text: string;
  pending?: boolean;
}

export function chatMessages(jobs: Job[]): ChatMessage[] {
  return jobs
    .filter((job) => job.input.kind === "chat")
    .reverse()
    .flatMap((job) => [
      { id: job.id + "u", role: "user", text: job.input.prompt },
      {
        id: job.id + "a",
        role: "assistant",
        text:
          job.status === "succeeded"
            ? job.result || ""
            : job.status === "failed"
              ? job.error || "回复失败"
              : "正在思考你的问题…",
        pending: job.status === "queued" || job.status === "running",
      },
    ]);
}
