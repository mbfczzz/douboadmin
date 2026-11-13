import { request, tab, media, error, openPage, openTab } from "../../utils/api";
import type { Row, Template, Config } from "../../services/types";
import { layout } from "./masonry";
import { navBottom } from "../../utils/nav-metrics";

const PAGE_SIZE = 10;
import type { Card } from "./masonry";
Page({
  data: {
    items: [] as Row<Template>[],
    visibleCount: 4,
    page: 1,
    total: 0,
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
  onLoad() {
    this.setData({ stickyTop: navBottom() });
  },
  onHide() {
    this.visible = false;
    this.setData({ heroPlay: false });
    this.loadVersion++;
    this.fetching = false;
    this.setData({ loading: false });
  },
  onUnload() {
    this.onHide();
    this.destroyed = true;
    this.loadVersion++;
  },
  onShow() {
    this.visible = true;
    // The muted preview follows 作品预览自动播放 (off by default).
    this.setData({ heroPlay: wx.getStorageSync("autoplay-preference") === true });
    tab(this, 0);
    void this.loadCategories();
    if (!this.loadedQuery) void this.load(true);
  },
  async load(keepContent = false, append = false) {
    if (this.destroyed || !this.visible) return;
    if (append && this.fetching) return;
    this.fetching = true;
    const page = append ? this.data.page + 1 : 1;
    const version = ++this.loadVersion;
    const query = append ? this.loadedQuery :
      "/templates?kind=video&category=" +
      encodeURIComponent(this.data.category) +
      "&q=" +
      encodeURIComponent(this.data.search);
    const preserve = keepContent === true && this.loadedQuery === query;
    this.setData({ loading: !preserve || append, loadError: "" });
    try {
      const result = await request<{items:Row<Template>[]; total:number}>(
        query + "&page=" + page + "&size=" + PAGE_SIZE,
        "GET",
        undefined,
        undefined,
        false,
      );
      if (version !== this.loadVersion) return;
      this.loadedQuery = query;
      const fetched = Array.isArray(result) ? result : result.items;
      const combined = append ? [...this.data.items, ...fetched] : fetched;
      const items = [...new Map(combined.map(row=>[row.id,row])).values()];
      items.forEach((t) => (t.data.cover = media(t.data.cover)));
      const visibleCount = items.length;
      this.setData({
        items,
        visibleCount,
        page, total: Array.isArray(result) ? result.length : result.total,
        hasMore: !Array.isArray(result) && items.length < result.total,
        ...layout(items.slice(0, visibleCount), this.data.category === this.data.categories[0] && !this.data.search),
      });
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
    try {
      const c = await request<Config>(
        "/config",
        "GET",
        undefined,
        undefined,
        false,
      );
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
    void this.load(true);
  },
  more() {
    if (this.data.items.length < this.data.total) void this.load(true,true);
  },
  // Scrolling to the bottom loads the next page; there is no "more" button.
  onReachBottom() {
    this.more();
  },
  choose(e: WechatMiniprogram.TouchEvent) {
    this.setData({ category: e.currentTarget.dataset.value });
    void this.load();
  },
  input(e: WechatMiniprogram.Input) {
    this.setData({ search: e.detail.value });
  },
  search() {
    void this.load();
  },
  clearSearch() {
    this.setData({ search: "" });
    void this.load();
  },
  create() {
    openTab(this, "/pages/create/index");
  },
  detail(e: WechatMiniprogram.TouchEvent) {
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
