import { request, openPage, media } from "../../utils/api";
import { rememberRows } from "../../utils/view-cache";
import type { Asset, Row, Template } from "../../services/types";

// 模板案例 on 剧情带货 / 探店视频: video templates whose sample (cover and
// preview, already generated) matches the preset's keyword, else the newest
// ones. Tapping a case opens that template's 做同款 with the pictures the
// user already put in here filled into its photo slots (TEMPLATE_PREFILL).
export type FeatureCase = { id: string; cover: string; title: string; seconds: number };
type Page = { data: { feature: string; assets: Row<Asset>[] }; destroyed: boolean; setData(data: Record<string, unknown>): void };

export const TEMPLATE_PREFILL = "template-prefill";
const SIZE = 10;

async function templates(q: string) {
  const r = await request<{ items: Row<Template>[] }>(`/templates?kind=video&page=1&size=${SIZE}&q=${encodeURIComponent(q)}`, "GET", undefined, undefined, false);
  return r.items.filter((t) => t.data.cover);
}

export async function loadCases(page: Page, keyword: string) {
  if (!keyword) return;
  try {
    let rows = await templates(keyword);
    if (!rows.length) rows = await templates("");
    if (page.destroyed) return;
    rememberRows(rows); // the template page paints at once
    const cases: FeatureCase[] = rows.map((t) => ({ id: t.id, cover: media(t.data.cover), title: t.data.title, seconds: t.data.duration || 0 }));
    page.setData({ featureCases: cases });
  } catch {
    // no strip: the preset works without examples
  }
}

// The pictures go along (images only, in order); the template page decides
// which slots they fill and the user can replace them there.
export function openCase(page: Page, id: string) {
  const assets = page.data.assets.filter((a) => a.data.type?.startsWith("image/"));
  if (assets.length) wx.setStorageSync(TEMPLATE_PREFILL, { templateId: id, assets });
  else wx.removeStorageSync(TEMPLATE_PREFILL);
  openPage(page, { url: "/pages/template-detail/index?id=" + id });
}
