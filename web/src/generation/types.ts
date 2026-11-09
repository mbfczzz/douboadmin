import type { Job } from "../api";
import type { LogEntry } from "../logs/types";

export interface GenInput {
  id: string;
  kind: "image" | "video" | "audio" | "file";
  mime: string;
  size: number;
  url: string;
  label: string;
}
export interface GenExecution {
  phase: string;
  taskId?: string;
  modelKey?: string;
  note?: string;
  errorCause?: string;
  startedAt: string;
}
export interface Generation {
  job: Job & {
    input: Job["input"] & Record<string, unknown>;
    updatedAt?: string;
  };
  inputs: GenInput[];
  execution: GenExecution | null;
  calls: LogEntry[];
  polls: number;
  morePolls: boolean;
}

// Generation parameters worth showing, in display order.
export const paramLabels: [string, string][] = [
  ["mode", "生成模式"],
  ["resolution", "分辨率"],
  ["ratio", "画面比例"],
  ["duration", "时长"],
  ["quality", "质量"],
  ["voice", "音色"],
  ["purpose", "用途"],
  ["templateId", "模板"],
  ["parentId", "来源任务"],
  ["sourceId", "来源素材"],
];
export const modeNames: Record<string, string> = {
  t2i: "文生图",
  i2i: "图生图",
  t2v: "文生视频",
  i2v: "图生视频",
  multi_ref: "多素材参考",
  first_last: "首尾帧",
};
export const billingNames: Record<string, string> = {
  reserved: "已预留",
  charged: "已扣除",
  released: "已退回",
};
// The points figure means different things as billing progresses.
export const pointsLabel: Record<string, string> = {
  reserved: "预留积分",
  charged: "消耗积分",
  released: "已退回积分",
};
export const phaseNames: Record<string, string> = {
  submitting: "提交中",
  uncertain: "提交结果待核实",
  polling: "查询上游结果",
  output: "保存生成结果",
  succeeded: "已完成",
  failed: "上游失败",
};

// "16分10秒" style elapsed time between two timestamps.
export function elapsed(from: string, to?: string) {
  const s = to ? Math.round((Date.parse(to) - Date.parse(from)) / 1000) : NaN;
  if (!(s >= 0)) return "—";
  const m = Math.floor(s / 60);
  return m ? `${m}分${s % 60}秒` : `${s}秒`;
}

// What the result URL holds: by task kind first, then by file extension.
export function resultKind(job: Job): "image" | "video" | "audio" | "text" {
  const kind = job.input.kind;
  if (kind === "chat") return "text";
  if (kind === "image" || kind === "video" || kind === "audio") return kind;
  const url = (job.result || "").split("?")[0].toLowerCase();
  if (/\.(png|jpe?g|webp|gif)$/.test(url)) return "image";
  if (/\.(mp3|wav|m4a|aac|ogg)$/.test(url)) return "audio";
  return "video";
}
