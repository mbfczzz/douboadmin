import { request, hasSession, media } from "../../utils/api";
import type { HotVideo } from "../../services/hot-video";
import type { View } from "./actions";

// Fill-in examples on the interface-first feature pages: a sample picture
// into an upload (视频唱歌), and real hot videos whose link goes into the
// link box (视频二创). Text examples are handled in index.ts.
export type HotLink = { id: string; cover: string; title: string; link: string };
type Page = {
  data: { sections: View[]; art: Record<string, string> };
  destroyed: boolean;
  setData(data: Record<string, unknown>): void;
};

// The hot videos for each 热门视频示例 strip (visitors and a closed source: no strip).
export async function loadHotLinks(page: Page) {
  if (!hasSession()) return;
  const sections = page.data.sections;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (s.type !== "hotlinks" || s.links?.length) continue;
    try {
      const r = await request<{ items: HotVideo[] }>(`/hot/videos?q=${encodeURIComponent(s.keyword)}&cursor=0&searchId=&backtrace=&history=0`);
      const links: HotLink[] = r.items.filter((v) => v.cover).slice(0, 8)
        .map((v) => ({ id: v.id, cover: media(v.cover), title: v.title, link: v.sourceUrl || "https://www.douyin.com/video/" + v.id }));
      if (!page.destroyed) page.setData({ [`sections[${i}].links`]: links });
    } catch {
      // examples are optional
    }
  }
}

export const exampleHandlers = {
  // A sample picture stands in for the user's own (marked 示例).
  sample(this: Page, e: WechatMiniprogram.TouchEvent) {
    const { section, index } = e.currentTarget.dataset as { section: number; index: number };
    const s = this.data.sections[section];
    if (!s || s.type !== "upload" || !s.samples?.[index] || s.uploading) return;
    const pick = s.samples[index];
    const url = this.data.art[pick.art as string];
    if (!url) return;
    this.setData({ [`sections[${section}].file`]: { id: "", url, cover: "", isImage: true, name: pick.label + "（示例照片）", sample: true } });
  },
  useHotLink(this: Page, e: WechatMiniprogram.TouchEvent) {
    const { section, index } = e.currentTarget.dataset as { section: number; index: number };
    const s = this.data.sections[section];
    const item = s?.links?.[index];
    if (!item || s.target === undefined || s.target < 0) return;
    this.setData({ [`sections[${s.target}].value`]: item.link });
    wx.showToast({ title: "已填入示例链接", icon: "none" });
  },
};
