import { request, tab, media, error, openPage } from "../../utils/api";
import type { Row, Template, Config } from "../../services/types";
Page({
  data: {
    items: [] as Row<Template>[],
    visibleCount: 4,
    page: 1,
    total: 0,
    columns: [] as { id: number; items: Row<Template>[] }[],
    category: "推荐",
    categories: ["推荐"],
    search: "",
    searching: false,
    loading: true,
    loadError: "",
  },
  loadVersion: 0,
  destroyed: false,
  loadedQuery: "",
  fetching: false,
  visible: true,
  onHide() {
    this.visible = false;
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
      "/templates?category=" +
      encodeURIComponent(this.data.category) +
      "&q=" +
      encodeURIComponent(this.data.search);
    const preserve = keepContent === true && this.loadedQuery === query;
    this.setData({ loading: !preserve || append, loadError: "" });
    try {
      const result = await request<{items:Row<Template>[]; total:number}>(
        query + "&page=" + page + "&size=4",
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
        columns: [
          {
            id: 0,
            items: items.slice(0, visibleCount).filter((_, i) => i % 2 === 0),
          },
          {
            id: 1,
            items: items.slice(0, visibleCount).filter((_, i) => i % 2 === 1),
          },
        ],
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
    if (this.data.page * 4 < this.data.total) void this.load(true,true);
  },
  choose(e: WechatMiniprogram.TouchEvent) {
    this.setData({ category: e.currentTarget.dataset.value });
    void this.load();
  },
  toggleSearch() {
    this.setData({ searching: !this.data.searching });
  },
  input(e: WechatMiniprogram.Input) {
    this.setData({ search: e.detail.value });
  },
  search() {
    void this.load();
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
