import type { Job, ChatMessage } from "../services/types";
export type { ChatMessage } from "../services/types";

// "镜头 1（0–3 秒）：…" or "【开场】…" become a highlighted label and its text,
// so scripts read as shots rather than a wall of prose.
const labelled = [/^\s*((?:镜头|分镜|场景|画面|第)[^：:\n]{0,14})[：:]\s*(.*)$/, /^\s*【([^】]{1,12})】\s*(.*)$/];
export function scriptLines(text: string) {
  return text.split("\n").map((line) => {
    for (const rule of labelled) {
      const m = rule.exec(line);
      if (m) return { label: m[1].trim(), text: m[2] };
    }
    return { label: "", text: line };
  });
}

export function chatMessages(jobs: Job[]): ChatMessage[] {
  return jobs
    .filter((job) => job.input.kind === "chat")
    .reverse()
    .flatMap((job) => {
      const failed = job.status === "failed";
      const text =
        job.status === "succeeded" ? job.result || "" : failed ? job.error || "回复失败" : "正在思考你的问题…";
      return [
        { id: job.id + "u", role: "user", text: job.input.prompt },
        {
          id: job.id + "a",
          role: "assistant",
          text,
          prompt: job.input.prompt,
          failed,
          lines: job.status === "succeeded" ? scriptLines(text) : [],
          pending: job.status === "queued" || job.status === "running",
        },
      ];
    });
}
