export interface HotVideo {
  id: string;
  title: string;
  text: string;
  author: string;
  cover: string;
  url: string;
  sourceUrl: string;
  likes: number | null;
  views: number | null;
  comments: number | null;
  publishedAt: string;
  duration: number;
}
export interface HotResult {
  items: HotVideo[];
  cursor: number;
  hasMore: boolean;
  searchId: string;
  backtrace: string;
  sortScope: string;
  cached: boolean;
  fetchedAt: string;
}
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
