import { loadConfig, peekConfig } from "../../utils/config-cache";
import { featureClick } from "../../services/analytics";
import { readView, writeView, rememberRows, VIEW_MAX_AGE, noteIssued } from "../../utils/view-cache";
import { request, tab, media, error, openPage, openTab } from "../../utils/api";
import type { Row, Template } from "../../services/types";
import { layout } from "./masonry";
import type { Card } from "./masonry";
import { navBottom } from "../../utils/nav-metrics";
import { featuredOn } from "../../utils/featured-mode";
import { queue, startTaskCount, stopTaskCount } from "../../services/task-count";

type Feed = { items: Row<Template>[]; total: number };
Page({
  data: {
    featured: false, // the 优秀 tab's view of this page (utils/featured-mode)
    shown: false,
    runningTasks: 0,
    items: [] as Row<Template>[],
    visibleCount: 0,
    total: 0,
    page: 1,
    hero: null as Card | null,
    heroPlay: false, // the featured preview plays only while the page shows
    stickyTop: 0,
    hasMore: false,
    columns: [] as ReturnType<typeof layout>["columns"],
    category: "推荐",
    categories: ["推荐"],
    search: "",
    loading: true,
    loadError: "",
  },
  loadVersion: 0,
  destroyed: false,
  loadedQuery: "",
  fetching: false,
  visible: true,
  searchTimer: 0,
  scrollAt: [0, 0], // 模板 / 优秀 scroll positions
  queue,
  onLoad() {
    this.scrollAt = [0, 0];
    this.setData({ stickyTop: navBottom() });
  },
  onHide() {
    clearTimeout(this.searchTimer);
    this.visible = false;
    stopTaskCount(this);
    this.setData({ heroPlay: false, shown: false, loading: false });
    this.loadVersion++;
    this.fetching = false;
  },
  onUnload() {
    this.onHide();
    this.destroyed = true;
  },
  onShow() {
    this.visible = true;
    // The muted preview follows 作品预览自动播放 (off by default).
    this.setData({ heroPlay: wx.getStorageSync("autoplay-preference") === true, shown: true });
    this.applyTabView();
  },
  // 模板 or 优秀: the tab bar sets the view, this page shows it in place.
  applyTabView() {
    const featured = featuredOn();
    if (featured !== this.data.featured) {
      // Each view keeps its own scroll: read the old one before switching
      // (the query runs ahead of setData), then return to the new one's.
      const from = Number(this.data.featured), to = Number(featured), at = this.scrollAt;
      if (typeof wx.createSelectorQuery === "function")
        wx.createSelectorQuery().selectViewport().scrollOffset((r) => {
          at[from] = r?.scrollTop || 0;
          wx.pageScrollTo({ scrollTop: at[to], duration: 0 });
        }).exec();
      else wx.pageScrollTo({ scrollTop: 0, duration: 0 });
      if (!featured) this.selectComponent("#featured")?.close(); // a work's popup goes with its view
      this.setData({ featured });
    }
    tab(this, 0);
    if (featured) return stopTaskCount(this);
    startTaskCount(this);
    void this.loadCategories();
    if (!this.loadedQuery) void this.load(true);
  },
  showFeed({ items, total }: Feed, query: string, page: number) {
    this.loadedQuery = query;
    rememberRows(items);
    const featured = this.data.category === this.data.categories[0] && !this.data.search.trim();
    this.setData({ items, page, total, visibleCount: items.length, hasMore: items.length < total, ...layout(items, featured) });
  },
  async load(keepContent = false, append = false) {
    if (this.destroyed || !this.visible) return;
    if (append && this.fetching) return;
    this.fetching = true;
    const page = append ? this.data.page + 1 : 1;
    const version = ++this.loadVersion;
    const query = append ? this.loadedQuery :
      // A search spans every category.
      "/templates?kind=video&category=" +
      encodeURIComponent(this.data.search.trim() ? "推荐" : this.data.category) +
      "&q=" +
      encodeURIComponent(this.data.search.trim());
    const preserve = keepContent === true && this.loadedQuery === query;
    // Seen before (this session or a recent launch): show it at once.
    const key = "templates:" + query;
    const cached = !append && !preserve && readView<Feed>(key, VIEW_MAX_AGE);
    if (cached) this.showFeed(cached, query, 1);
    this.setData({ loading: !cached && (!preserve || append), loadError: "" });
    try {
      const result = await request<Feed | Row<Template>[]>(
        query + "&page=" + page + "&size=10",
        "GET",
        undefined,
        undefined,
        false,
      );
      if (version !== this.loadVersion) return;
      const fetched = Array.isArray(result) ? result : result.items;
      const combined = append ? [...this.data.items, ...fetched] : fetched;
      const items = [...new Map(combined.map(row=>[row.id,row])).values()];
      items.forEach((t) => (t.data.cover = media(t.data.cover)));
      const feed = { items, total: Array.isArray(result) ? result.length : result.total };
      if (!append) writeView(key, feed, !this.data.search.trim());
      noteIssued(...items.map((t) => t.data.cover));
      this.showFeed(feed, query, page);
    } catch (e) {
      if (version !== this.loadVersion) return;
      if (preserve) error(e);
      else this.setData({ loadError: (e as Error).message });
    } finally {
      if (version === this.loadVersion) {
        this.fetching = false;
        this.setData({ loading: false });
        wx.stopPullDownRefresh();
      }
    }
  },
  async loadCategories() {
    const known = peekConfig();
    if (known?.categories?.length && !this.data.categories[1]) this.setData({ categories: known.categories });
    try {
      const c = await loadConfig();
      if (this.destroyed || !this.visible) return;
      this.setData({ categories: c.categories });
      if (!c.categories.includes(this.data.category)) {
        this.setData({ category: "推荐" });
        void this.load();
      }
    } catch {
      /* The content request provides the retry affordance. */
    }
  },
  onPullDownRefresh() {
    if (this.data.featured) void this.selectComponent("#featured")?.refresh();
    else void this.load(true);
  },
  more() {
    if (this.data.hasMore) void this.load(true, true);
  },
  // Scrolling to the bottom loads the next page; there is no "more" button.
  onReachBottom() {
    if (!this.data.featured) this.more();
  },
  choose(e: WechatMiniprogram.TouchEvent) {
    clearTimeout(this.searchTimer);
    this.setData({ category: e.currentTarget.dataset.value, search: "" });
    void this.load();
  },
  // Results follow typing after a short pause; the 搜索 key searches at once.
  input(e: WechatMiniprogram.Input) {
    this.setData({ search: e.detail.value });
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.load(), 400) as unknown as number;
  },
  search() {
    clearTimeout(this.searchTimer);
    void this.load();
  },
  clearSearch() {
    clearTimeout(this.searchTimer);
    this.setData({ search: "" });
    void this.load();
  },
  create() {
    openTab(this, "/pages/studio/index");
  },
  detail(e: WechatMiniprogram.TouchEvent) {
    featureClick("template");
    openPage(this, {
      url: "/pages/template-detail/index?id=" + e.currentTarget.dataset.id,
    });
  },
  onShareAppMessage() {
    return {
      title: "豆播 AI · 给灵感一个落点",
      path: "/pages/templates/index",
    };
  },
});
