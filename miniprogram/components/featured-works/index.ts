import { error } from "../../utils/api";
import { readView, writeView } from "../../utils/view-cache";
import { featuredPage, featuredDetail } from "../../services/featured-works";
import type { FeaturedWork } from "../../services/featured-works";

type Self = { revision: number; detailRevision: number; visible: boolean; loaded?: { key: string; at: number } };

// A list shown within this long is shown again as it was (covers are signed
// for 15 minutes): coming back from a picture preview hides and shows the
// page, which must not reload every cover.
const FRESH = 10 * 60 * 1000;

// 优秀作品 inside the 模板 tab page; `active` starts loads, and answers
// arriving after it turns off are dropped.
Component({
  options: { addGlobalClass: true },
  properties: { active: { type: Boolean, value: false } },
  data: {
    works: [] as FeaturedWork[], total: 0, page: 1, kind: "", loading: true, loadError: "",
    detail: null as FeaturedWork | null, opening: "", videoError: "", videoHeight: "",
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
      const s = this.self();
      s.visible = true;
      // (A load cut short by the hide, e.g. a pull-down refresh, runs again.)
      if (s.loaded?.key === this.viewKey() && Date.now() - s.loaded.at < FRESH && !this.data.loading && !this.data.loadError) return;
      void this.load();
    },
    // Late answers are dropped; a picture popup stays for the return, a video
    // does not.
    hide() {
      const s = this.self();
      s.visible = false;
      s.revision++;
      s.detailRevision++;
      if (this.data.detail?.kind === "video") this.setData({ detail: null });
      this.setData({ opening: "" });
    },
    viewKey() {
      return `featured:${this.data.kind}:${this.data.page}`;
    },
    refresh() {
      this.setData({ page: 1 });
      return this.load();
    },
    async load() {
      const s = this.self(), version = ++s.revision;
      // Seen this session (covers are signed for 15 min): show it at once.
      const key = this.viewKey();
      const seen = readView<{ items: FeaturedWork[]; total: number }>(key, 10 * 60 * 1000);
      this.setData({ loading: true, loadError: "", ...(seen && !this.data.works.length ? { works: seen.items, total: seen.total } : {}) });
      try {
        const result = await featuredPage(this.data.page, this.data.kind);
        if (!s.visible || version !== s.revision) return;
        const last = Math.max(1, Math.ceil(result.total / 20));
        if (this.data.page > last) { this.setData({ page: last, works: [] }); void this.load(); return; }
        this.setData({ works: result.items, total: result.total });
        s.loaded = { key, at: Date.now() };
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
      this.setData({ opening: id, detail: null, videoError: "", videoHeight: "" });
      try {
        const detail = await featuredDetail(id);
        if (s.visible && version === s.detailRevision) this.setData({ detail });
      } catch (e) {
        if (s.visible && version === s.detailRevision) { error(e); void this.load(); }
      } finally {
        if (s.visible && version === s.detailRevision) this.setData({ opening: "" });
      }
    },
    close() { this.self().detailRevision++; this.setData({ detail: null, opening: "" }); },
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
    // A tall video keeps its shape within the popup.
    videoShape(e: WechatMiniprogram.CustomEvent<{ width: number; height: number }>) {
      const { width, height } = e.detail, view = wx.getWindowInfo();
      if (width > 0 && height > 0) this.setData({ videoHeight: `height: ${Math.round(Math.min(view.windowHeight * 0.65, (view.windowWidth - 32) * height / width))}px;` });
    },
    // (A tap signs the video again.)
    videoFailed() { this.setData({ videoError: "视频暂时无法播放，点击重试" }); },
  },
});
