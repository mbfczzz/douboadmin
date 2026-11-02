import { request, tab, media, error, openPage } from "../../utils/api";
import type { Row, Template, Config } from "../../services/types";
Page({
  data: {
    items: [] as Row<Template>[],
    visibleCount: 4,
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
  onUnload() {
    this.destroyed = true;
    this.loadVersion++;
  },
  onShow() {
    tab(this, 0);
    void this.loadCategories();
    void this.load(true);
  },
  async load(keepContent = false) {
    const version = ++this.loadVersion;
    const query =
      "/templates?category=" +
      encodeURIComponent(this.data.category) +
      "&q=" +
      encodeURIComponent(this.data.search);
    const preserve = keepContent === true && this.loadedQuery === query;
    this.setData({ loading: !preserve, loadError: "" });
    try {
      const items = await request<Row<Template>[]>(
        query,
        "GET",
        undefined,
        undefined,
        false,
      );
      if (version !== this.loadVersion) return;
      this.loadedQuery = query;
      items.forEach((t) => (t.data.cover = media(t.data.cover)));
      const visibleCount = preserve ? this.data.visibleCount : 4;
      this.setData({
        items,
        visibleCount,
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
      if (this.destroyed) return;
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
    const visibleCount = this.data.visibleCount + 4;
    const items: Row<Template>[] = this.data.items.slice(0, visibleCount);
    this.setData({
      visibleCount,
      columns: [
        { id: 0, items: items.filter((_, i) => i % 2 === 0) },
        { id: 1, items: items.filter((_, i) => i % 2 === 1) },
      ],
    });
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
