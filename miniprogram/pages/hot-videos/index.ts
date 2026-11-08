import {
  request,
  error,
  enterPage,
  hasSession,
  openPage,
  openTab,
} from "../../utils/api";
import { hotView } from "../../services/hot-video";
import type { HotResult } from "../../services/hot-video";
import { track } from "../../services/analytics";
Page({
  data: {
    query: "",
    sort: "relevance",
    enabled: false,
    words: [] as string[],
    wordSource: "推荐关键词",
    history: [] as { keyword: string }[],
    items: [] as ReturnType<typeof hotView>[],
    loading: false,
    loadError: "",
    hasMore: false,
    sortScope: "upstream",
    searched: false,
  },
  revision: 0,
  discoveryRevision: 0,
  destroyed: false,
  cursor: 0,
  searchId: "",
  backtrace: "",
  onShow() {
    enterPage(this);
    void this.discovery();
  },
  onUnload() {
    this.revision++;
    this.discoveryRevision++;
    this.destroyed = true;
  },
  async discovery() {
    if (this.destroyed) return;
    const version = ++this.discoveryRevision;
    try {
      const d = await request<{
        enabled: boolean;
        keywords: string[];
        source: string;
      }>("/hot/discovery", "GET", undefined, undefined, false);
      if (version !== this.discoveryRevision) return;
      this.setData({
        enabled: d.enabled,
        words: d.keywords,
        wordSource: d.source,
      });
      if (hasSession()) {
        const history = await request<{ keyword: string }[]>("/hot/history");
        if (version === this.discoveryRevision) this.setData({ history });
      } else this.setData({ history: [] });
    } catch (e) {
      if (version === this.discoveryRevision)
        this.setData({ loadError: (e as Error).message });
    }
  },
  input(e: WechatMiniprogram.Input) {
    this.setData({ query: e.detail.value });
  },
  choose(e: WechatMiniprogram.TouchEvent) {
    this.setData({ query: e.currentTarget.dataset.word });
    void this.search();
  },
  sort(e: WechatMiniprogram.TouchEvent) {
    this.setData({ sort: e.currentTarget.dataset.value });
    void this.search();
  },
  async search() {
    this.cursor = 0;
    this.searchId = "";
    this.backtrace = "";
    await this.fetch(false);
  },
  async more() {
    if (this.data.hasMore && !this.data.loading) await this.fetch(true);
  },
  async fetch(append: boolean) {
    if (!this.data.query.trim()) {
      error(new Error("请输入搜索关键词"));
      return;
    }
    if (!this.data.enabled) {
      error(new Error("热门视频暂不可用"));
      return;
    }
    const version = ++this.revision;
    this.setData({ loading: true, loadError: "", searched: true });
    try {
      const query = `?q=${encodeURIComponent(this.data.query.trim())}&sort=${this.data.sort}&cursor=${this.cursor}&searchId=${encodeURIComponent(this.searchId)}&backtrace=${encodeURIComponent(this.backtrace)}`;
      const r = await request<HotResult>("/hot/videos" + query);
      if (version !== this.revision) return;
      this.cursor = r.cursor;
      this.searchId = r.searchId;
      this.backtrace = r.backtrace;
      const existing = append ? this.data.items : [];
      const ids = new Set(
        existing.map((v: ReturnType<typeof hotView>) => v.id),
      );
      this.setData({
        items: [
          ...existing,
          ...r.items.filter((v) => !ids.has(v.id)).map(hotView),
        ],
        hasMore: r.hasMore,
        sortScope: r.sortScope,
      });
      track("search", "hot-videos");
      void this.discovery();
    } catch (e) {
      if (version === this.revision)
        this.setData({ loadError: (e as Error).message });
    } finally {
      if (version === this.revision) this.setData({ loading: false });
    }
  },
  async clearHistory() {
    const version = ++this.discoveryRevision;
    try {
      await request("/hot/history", "DELETE");
      if (version === this.discoveryRevision) this.setData({ history: [] });
    } catch (e) {
      if (version === this.discoveryRevision) error(e);
    }
  },
  detail(e: WechatMiniprogram.TouchEvent) {
    openPage(this, {
      url: "/pages/hot-detail/index?id=" + e.currentTarget.dataset.id,
    });
  },
  upload() {
    openTab(this, "/pages/mix/index");
  },
});
