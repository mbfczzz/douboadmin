import { request, enterPage, openTab } from "../../utils/api";
import { hotView } from "../../services/hot-video";
import type { HotVideo } from "../../services/hot-video";

// 一键复刻 (interface first): shows the chosen hot video; the remake itself
// is not open yet, so starting only says so.
Page({
  data: {
    video: null as ReturnType<typeof hotView> | null,
    loading: false,
    loadError: "",
  },
  id: "",
  revision: 0,
  onLoad(query: Record<string, string>) {
    this.id = query.id || "";
  },
  onShow() {
    enterPage(this);
    if (this.id && !this.data.video) void this.load();
  },
  onUnload() {
    this.revision++;
  },
  async load() {
    const version = ++this.revision;
    this.setData({ loading: true, loadError: "" });
    try {
      const video = await request<HotVideo>("/hot/videos/" + this.id);
      if (version === this.revision) this.setData({ video: hotView(video) });
    } catch (e) {
      if (version === this.revision) this.setData({ loadError: (e as Error).message });
    } finally {
      if (version === this.revision) this.setData({ loading: false });
    }
  },
  pick() {
    openTab(this, "/pages/studio/index");
  },
  start() {
    wx.showToast({ title: "一键复刻即将开放", icon: "none" });
  },
});
