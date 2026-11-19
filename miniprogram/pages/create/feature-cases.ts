import { request, hasSession, openPage } from "../../utils/api";
import type { HotResult } from "../../services/hot-video";

// 热门案例 on 剧情带货 / 探店视频: real Douyin hot videos for the preset's
// keyword (the same source and cache as the 创作 feed). Tapping one opens
// 一键复刻 for it. Visitors, or a source that is off, just see no strip.
export type FeatureCase = { id: string; cover: string; title: string };
type Page = { data: { feature: string }; destroyed: boolean; setData(data: Record<string, unknown>): void };

export async function loadCases(page: Page, keyword: string) {
  if (!keyword || !hasSession()) return;
  try {
    const r = await request<HotResult>(`/hot/videos?q=${encodeURIComponent(keyword)}&cursor=0&searchId=&backtrace=&history=0`);
    if (page.destroyed) return;
    const cases: FeatureCase[] = r.items.filter((v) => v.cover).slice(0, 10).map((v) => ({ id: v.id, cover: v.cover, title: Array.from(v.title).slice(0, 8).join("") }));
    page.setData({ featureCases: cases });
  } catch {
    // no strip: the preset works without examples
  }
}

export function openCase(page: object, id: string) {
  openPage(page, { url: "/pages/remake/index?id=" + id });
}
