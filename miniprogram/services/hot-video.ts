import type { HotVideo } from "./hot-video-types";
export type { HotVideo, HotResult } from "./hot-video-types";
export function count(value: number | null) {
  if (value === null || value === undefined) return "未提供";
  return value >= 10000 ? (value / 10000).toFixed(1) + "万" : String(value);
}
export function hotView(v: HotVideo) {
  return {
    ...v,
    likesText: count(v.likes),
    viewsText: count(v.views),
    dateText: v.publishedAt.startsWith("1970")
      ? "时间未提供"
      : v.publishedAt.slice(0, 10),
  };
}
