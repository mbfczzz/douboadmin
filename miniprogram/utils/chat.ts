import type { Job, ChatMessage } from "../services/types";
import { splitReply, planText, plainReply } from "./agent-plan";
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

// A generation started from a plan shows in the conversation as its own card.
function genMessage(job: Job): ChatMessage {
  const done = job.status === "succeeded";
  const thumb = done ? job.thumbnailUrl || (job.input.kind === "image" ? job.result || job.results?.[0] || "" : "") : "";
  const count = job.results?.length || (done ? 1 : 0); // pictures can come several at once
  return { id: job.id + "g", role: "gen", text: job.id, gen: { status: job.status, progress: job.progress || 0, kind: job.input.kind, thumb, error: job.error || "", count } };
}

export function chatMessages(jobs: Job[]): ChatMessage[] {
  const messages = jobs
    .filter((job) => job.input.kind === "chat" || (job.input.sessionId && (job.input.kind === "image" || job.input.kind === "video")))
    .reverse()
    .flatMap((job): ChatMessage[] => {
      if (job.input.kind !== "chat") return [genMessage(job)];
      const failed = job.status === "failed";
      const split = job.status === "succeeded" ? splitReply(job.result || "") : { text: failed ? job.error || "回复失败" : "正在思考你的问题…" };
      const reply = { ...split, text: job.status === "succeeded" ? plainReply(split.text) : split.text };
      return [
        { id: job.id + "u", role: "user", text: job.input.prompt },
        {
          id: job.id + "a",
          role: "assistant",
          text: reply.text,
          prompt: job.input.prompt,
          failed,
          lines: job.status === "succeeded" ? scriptLines(reply.text) : [],
          pending: job.status === "queued" || job.status === "running",
          copy: [reply.text, reply.plan && planText(reply.plan)].filter(Boolean).join("\n\n"),
          ...(reply.plan ? { plan: reply.plan } : {}),
          ...("broken" in reply && reply.broken ? { broken: true } : {}),
        },
      ];
    });
  // Plans are numbered 第 1 版, 第 2 版…; only the newest can generate.
  let version = 0;
  for (let i = 0; i < messages.length; i++) if (messages[i].plan) messages[i] = { ...messages[i], version: ++version };
  for (let i = messages.length - 1; i >= 0; i--)
    if (messages[i].plan) {
      messages[i] = { ...messages[i], latest: true };
      break;
    }
  return messages;
}
