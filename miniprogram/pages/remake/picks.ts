import { request, hasSession } from "../../utils/api";
import { hotView } from "../../services/hot-video";
import type { HotResult } from "../../services/hot-video";

// Ideas to remake while nothing is chosen: the 创作 feed's keywords and a
// few of each one's hot videos (served from the feed's shared cache); a tap
// loads that video here.
type Page = {
  data: { pickWords: string[]; pickWord: string };
  id: string;
  uploadId: string;
  pickRevision: number;
  destroyed: boolean;
  setData(data: Record<string, unknown>): void;
  load(): Promise<void>;
};
const PICKS = 6;

async function loadPickVideos(page: Page) {
  const revision = ++page.pickRevision;
  page.setData({ picksLoading: true });
  try {
    const r = await request<HotResult>(`/hot/videos?q=${encodeURIComponent(page.data.pickWord)}&cursor=0&searchId=&backtrace=&history=0`);
    if (revision === page.pickRevision && !page.destroyed) page.setData({ picks: r.items.slice(0, PICKS).map(hotView) });
  } catch {
    if (revision === page.pickRevision && !page.destroyed) page.setData({ picks: [] }); // ideas are optional
  } finally {
    if (revision === page.pickRevision && !page.destroyed) page.setData({ picksLoading: false });
  }
}

export const pickHandlers = {
  async loadPicks(this: Page) {
    if (this.data.pickWords.length || !hasSession()) return;
    try {
      const d = await request<{ enabled: boolean; keywords: string[] }>("/hot/discovery?words=0", "GET", undefined, undefined, false);
      if (this.destroyed || !d.enabled || !d.keywords?.length) return;
      this.setData({ pickWords: d.keywords.slice(0, 6), pickWord: d.keywords[0] });
      await loadPickVideos(this);
    } catch {
      // no ideas: the page still takes a link or an upload
    }
  },
  choosePickWord(this: Page, e: WechatMiniprogram.TouchEvent) {
    const word = e.currentTarget.dataset.word as string;
    if (word === this.data.pickWord) return;
    this.setData({ pickWord: word, picks: [] });
    void loadPickVideos(this);
  },
  usePick(this: Page, e: WechatMiniprogram.TouchEvent) {
    this.id = e.currentTarget.dataset.id as string;
    this.uploadId = "";
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
    void this.load();
  },
};
