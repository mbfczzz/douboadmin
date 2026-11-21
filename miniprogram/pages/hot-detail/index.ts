import { request, enterPage, openPage } from "../../utils/api";
import { hotView } from "../../services/hot-video";
import type { HotVideo } from "../../services/hot-video";

// 视频详情 of a hot video: its caption to copy, and 一键复刻 (the remake page
// takes it from here: breakdown, subjects to swap, 生成同款).
Page({
  data: {
    video: null as ReturnType<typeof hotView> | null,
    loading: true,
    loadError: "",
  },
  id: "",
  revision: 0,
  onLoad(o: Record<string, string>) {
    this.id = o.id;
  },
  onShow() {
    enterPage(this);
    if (!this.data.video) void this.load();
  },
  onUnload() {
    this.revision++;
  },
  async load() {
    const version = ++this.revision;
    try {
      const video = await request<HotVideo>("/hot/videos/" + this.id);
      if (version === this.revision)
        this.setData({ video: hotView(video), loadError: "" });
    } catch (e) {
      if (version === this.revision)
        this.setData({ loadError: (e as Error).message });
    } finally {
      if (version === this.revision) this.setData({ loading: false });
    }
  },
  copy() {
    if (this.data.video) wx.setClipboardData({ data: this.data.video.text });
  },
  remake() {
    if (this.data.video) openPage(this, { url: "/pages/remake/index?id=" + this.id });
  },
});
