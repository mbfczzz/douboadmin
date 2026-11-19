import { error } from "../../utils/api";
import { readView, writeView } from "../../utils/view-cache";
import { featuredPage, featuredDetail } from "../../services/featured-works";
import type { FeaturedWork } from "../../services/featured-works";

type Self = { revision: number; detailRevision: number; visible: boolean };

// 优秀作品 inside the 模板 tab page; `active` starts loads, and answers
// arriving after it turns off are dropped.
Component({
  options: { addGlobalClass: true },
  properties: { active: { type: Boolean, value: false } },
  data: {
    works: [] as FeaturedWork[], total: 0, page: 1, kind: "", loading: true, loadError: "",
    detail: null as FeaturedWork | null, opening: "", previewError: "",
    filters: [{ key: "", text: "全部" }, { key: "image", text: "图片" }, { key: "video", text: "视频" }],
  },
  observers: {
    active(on: boolean) {
      if (on) this.show();
      else this.hide();
    },
  },
  lifetimes: {
    detached() {
      this.hide();
    },
  },
  methods: {
    self() {
      const s = this as unknown as Self;
      s.revision = s.revision || 0;
      s.detailRevision = s.detailRevision || 0;
      return s;
    },
    show() {
      this.self().visible = true;
      void this.load();
    },
    hide() {
      const s = this.self();
      s.visible = false;
      s.revision++;
      this.close();
    },
    refresh() {
      this.setData({ page: 1 });
      return this.load();
    },
    async load() {
      const s = this.self(), version = ++s.revision;
      // Seen this session (covers are signed for 15 min): show it at once.
      const key = `featured:${this.data.kind}:${this.data.page}`;
      const seen = readView<{ items: FeaturedWork[]; total: number }>(key, 10 * 60 * 1000);
      this.setData({ loading: true, loadError: "", ...(seen && !this.data.works.length ? { works: seen.items, total: seen.total } : {}) });
      try {
        const result = await featuredPage(this.data.page, this.data.kind);
        if (!s.visible || version !== s.revision) return;
        const last = Math.max(1, Math.ceil(result.total / 20));
        if (this.data.page > last) { this.setData({ page: last, works: [] }); void this.load(); return; }
        this.setData({ works: result.items, total: result.total });
        writeView(key, { items: result.items, total: result.total }, false);
      } catch (e) {
        if (s.visible && version === s.revision) this.setData({ works: [], total: 0, loadError: (e as Error).message });
      } finally {
        if (s.visible && version === s.revision) { this.setData({ loading: false }); wx.stopPullDownRefresh(); }
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
      const s = this.self(), id = e.currentTarget.dataset.id, version = ++s.detailRevision;
      this.setData({ opening: id, detail: null, previewError: "" });
      try {
        const detail = await featuredDetail(id);
        if (s.visible && version === s.detailRevision) this.setData({ detail });
      } catch (e) {
        if (s.visible && version === s.detailRevision) { error(e); void this.load(); }
      } finally {
        if (s.visible && version === s.detailRevision) this.setData({ opening: "" });
      }
    },
    close() { this.self().detailRevision++; this.setData({ detail: null, opening: "", previewError: "" }); },
    popupChange(e: WechatMiniprogram.CustomEvent<{ visible: boolean }>) { if (!e.detail.visible) this.close(); },
    async preview(e: WechatMiniprogram.CustomEvent<{ index: number }>) {
      const s = this.self(), shown = this.data.detail;
      if (!shown || shown.kind !== "image") return;
      const version = ++s.detailRevision;
      try {
        const fresh = await featuredDetail(shown.id);
        if (!s.visible || version !== s.detailRevision) return;
        this.setData({ detail: fresh });
        const urls = fresh.results || [];
        if (urls[e.detail.index]) wx.previewImage({ urls, current: urls[e.detail.index] });
      } catch (e) {
        if (s.visible && version === s.detailRevision) { this.close(); error(e); void this.load(); }
      }
    },
    mediaError() { this.setData({ previewError: "作品暂时无法加载，请关闭后重试" }); },
  },
});
