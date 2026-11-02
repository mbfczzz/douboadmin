import {
  request,
  jobView,
  openTask,
  enterPage,
  openTab,
  login,
  hasSession,
  error,
} from "../../utils/api";
import type { Job } from "../../services/types";

Page({
  data: {
    works: [] as ReturnType<typeof jobView>[],
    filtered: [] as ReturnType<typeof jobView>[],
    filter: "all",
    filters: [
      { key: "all", text: "全部" },
      { key: "image", text: "图片" },
      { key: "video", text: "视频" },
    ],
    loading: true,
    loadError: "",
    needsLogin: false,
    signingIn: false,
  },
  loadVersion: 0,
  destroyed: false,
  onShow() {
    enterPage(this);
    void this.load();
  },
  onUnload() {
    this.destroyed = true;
    this.loadVersion++;
  },
  onPullDownRefresh() {
    void this.load();
  },
  async load() {
    const version = ++this.loadVersion;
    if (!hasSession()) {
      this.setData({
        needsLogin: true,
        loading: false,
        loadError: "",
        works: [],
        filtered: [],
      });
      wx.stopPullDownRefresh();
      return;
    }
    try {
      const jobs = await request<Job[]>("/jobs");
      if (version !== this.loadVersion) return;
      this.setData({
        works: jobs
          .filter(
            (job) =>
              job.status === "succeeded" &&
              ["image", "video", "mix"].includes(job.input.kind) &&
              !job.deleted,
          )
          .map(jobView),
        needsLogin: false,
        loadError: "",
      });
      this.filterWorks();
    } catch (e) {
      if (version !== this.loadVersion) return;
      if (!hasSession())
        this.setData({
          needsLogin: true,
          works: [],
          filtered: [],
          loadError: "",
        });
      else this.setData({ loadError: (e as Error).message });
    } finally {
      if (version === this.loadVersion) {
        this.setData({ loading: false });
        wx.stopPullDownRefresh();
      }
    }
  },
  filterWorks() {
    const filter = this.data.filter;
    this.setData({
      filtered: this.data.works.filter(
        (job: Job) =>
          filter === "all" ||
          (filter === "image"
            ? job.input.kind === "image"
            : ["video", "mix"].includes(job.input.kind)),
      ),
    });
  },
  choose(e: WechatMiniprogram.TouchEvent) {
    this.setData({ filter: e.currentTarget.dataset.value });
    this.filterWorks();
  },
  async signIn() {
    if (this.data.signingIn) return;
    this.setData({ signingIn: true });
    try {
      await login("works");
      await this.load();
    } catch (e) {
      error(e);
    } finally {
      if (!this.destroyed) this.setData({ signingIn: false });
    }
  },
  detail(e: WechatMiniprogram.TouchEvent) {
    openTask(e.currentTarget.dataset.id, this);
  },
  create() {
    openTab(this, "/pages/create/index");
  },
});
