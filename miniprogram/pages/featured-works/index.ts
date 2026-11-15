import { enterPage, error } from "../../utils/api";
import { featuredPage, featuredDetail } from "../../services/featured-works";
import type { FeaturedWork } from "../../services/featured-works";

Page({
  data: {
    works: [] as FeaturedWork[], total: 0, page: 1, kind: "", loading: true, loadError: "",
    detail: null as FeaturedWork | null, opening: "", previewError: "",
    filters: [{ key: "", text: "全部" }, { key: "image", text: "图片" }, { key: "video", text: "视频" }],
  },
  revision: 0,
  detailRevision: 0,
  visible: true,
  onShow() { this.visible = true; enterPage(this); void this.load(); },
  onHide() { this.visible = false; this.revision++; this.close(); },
  onUnload() { this.visible = false; this.revision++; this.close(); },
  onPullDownRefresh() { this.setData({ page: 1 }); void this.load(); },
  async load() {
    const version = ++this.revision;
    this.setData({ loading: true, loadError: "" });
    try {
      const result = await featuredPage(this.data.page, this.data.kind);
      if (!this.visible || version !== this.revision) return;
      const last = Math.max(1, Math.ceil(result.total / 20));
      if (this.data.page > last) { this.setData({ page: last, works: [] }); void this.load(); return; }
      this.setData({ works: result.items, total: result.total });
    } catch (e) {
      if (this.visible && version === this.revision) this.setData({ works: [], total: 0, loadError: (e as Error).message });
    } finally {
      if (this.visible && version === this.revision) { this.setData({ loading: false }); wx.stopPullDownRefresh(); }
    }
  },
  choose(e: WechatMiniprogram.TouchEvent) {
    this.close();
    this.setData({ kind: e.currentTarget.dataset.kind, page: 1, works: [] });
    void this.load();
  },
  previous() { if (!this.data.loading && this.data.page > 1) { this.close(); this.setData({ page: this.data.page - 1, works: [] }); void this.load(); } },
  next() { if (!this.data.loading && this.data.page * 20 < this.data.total) { this.close(); this.setData({ page: this.data.page + 1, works: [] }); void this.load(); } },
  async open(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id;
    const version = ++this.detailRevision;
    this.setData({ opening: id, detail: null, previewError: "" });
    try {
      const detail = await featuredDetail(id);
      if (this.visible && version === this.detailRevision) this.setData({ detail });
    } catch (e) {
      if (this.visible && version === this.detailRevision) { error(e); void this.load(); }
    } finally {
      if (this.visible && version === this.detailRevision) this.setData({ opening: "" });
    }
  },
  close() { this.detailRevision++; this.setData({ detail: null, opening: "", previewError: "" }); },
  popupChange(e: WechatMiniprogram.CustomEvent<{ visible: boolean }>) { if (!e.detail.visible) this.close(); },
  async preview(e: WechatMiniprogram.CustomEvent<{ index: number }>) {
    const shown = this.data.detail;
    if (!shown || shown.kind !== "image") return;
    const version = ++this.detailRevision;
    try {
      const fresh = await featuredDetail(shown.id);
      if (!this.visible || version !== this.detailRevision) return;
      this.setData({ detail: fresh });
      const urls = fresh.results || [];
      if (urls[e.detail.index]) wx.previewImage({ urls, current: urls[e.detail.index] });
    } catch (e) {
      if (this.visible && version === this.detailRevision) { this.close(); error(e); void this.load(); }
    }
  },
  mediaError() { this.setData({ previewError: "作品暂时无法加载，请关闭后重试" }); },
});
