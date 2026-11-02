import {
  request,
  error,
  enterPage,
  uid,
  openTab,
  media,
} from "../../utils/api";
import type { Job, Row, Asset } from "../../services/types";
import { hotView } from "../../services/hot-video";
import type { HotVideo } from "../../services/hot-video";
Page({
  data: {
    video: null as ReturnType<typeof hotView> | null,
    loading: true,
    loadError: "",
    busy: false,
    progress: "",
  },
  id: "",
  jobId: "",
  key: "",
  visible: true,
  destroyed: false,
  revision: 0,
  timer: 0,
  polling: false,
  onLoad(o: Record<string, string>) {
    this.id = o.id;
    this.key = uid();
  },
  onShow() {
    this.visible = true;
    enterPage(this);
    if (!this.data.video) void this.load();
    if (this.jobId) void this.poll();
  },
  onHide() {
    this.visible = false;
    clearTimeout(this.timer);
  },
  onUnload() {
    this.destroyed = true;
    this.visible = false;
    this.revision++;
    clearTimeout(this.timer);
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
  async use() {
    if (this.data.busy || !this.data.video) return;
    this.setData({ busy: true, progress: "正在创建导入任务" });
    try {
      const job = await request<Job>(
        "/hot/videos/" + this.id + "/import",
        "POST",
        {},
        this.key,
      );
      if (this.destroyed) return;
      this.jobId = job.id;
      void this.poll();
    } catch (e) {
      if (!this.destroyed) {
        error(e);
        this.setData({ busy: false });
      }
    }
  },
  async poll() {
    if (!this.visible || !this.jobId || this.polling) return;
    this.polling = true;
    try {
      const job = await request<Job>("/jobs/" + this.jobId);
      if (!this.visible) return;
      this.setData({ progress: job.stage || "正在导入素材" });
      if (job.status === "failed") {
        this.jobId = "";
        this.key = uid();
        this.setData({ busy: false });
        throw new Error(job.error || "素材导入失败");
      }
      if (job.status === "succeeded" && job.resultAssetId) {
        const row = await request<Row<Asset>>("/assets/" + job.resultAssetId);
        row.data.url = media(row.data.url);
        if (!this.visible) return;
        wx.setStorageSync("mix-add-asset", row);
        wx.setStorageSync(
          "mix-source-text",
          this.data.video?.text.slice(0, 500) || "",
        );
        this.jobId = "";
        this.setData({ busy: false });
        openTab(this, "/pages/mix/index");
        return;
      }
      this.timer = setTimeout(() => void this.poll(), 2500);
    } catch (e) {
      if (this.visible) error(e);
      if (this.jobId && this.visible)
        this.timer = setTimeout(() => void this.poll(), 5000);
    } finally {
      this.polling = false;
    }
  },
});
