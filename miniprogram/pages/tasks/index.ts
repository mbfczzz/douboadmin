import {
  request,
  jobView,
  openTask,
  enterPage,
  openTab,
  openPage,
  hasSession,
  login,
  error,
} from "../../utils/api";
import type { Job } from "../../services/types";
Page({
  data: {
    jobs: [] as ReturnType<typeof jobView>[],
    ongoing: [] as ReturnType<typeof jobView>[],
    completed: [] as ReturnType<typeof jobView>[],
    runningCount: 0,
    failedCount: 0,
    loading: true,
    loadError: "",
    needsLogin: false,
    signingIn: false,
  },
  timer: 0,
  fetching: false,
  destroyed: false,
  onShow() {
    enterPage(this);
    void this.load();
    this.startPolling();
  },
  startPolling() {
    clearInterval(this.timer);
    if (hasSession()) this.timer = setInterval(() => void this.load(), 3000);
  },
  async signIn() {
    if (this.data.signingIn) return;
    this.setData({ signingIn: true });
    try {
      await login("tasks");
      await this.load();
      this.startPolling();
    } catch (e) {
      error(e);
    } finally {
      if (!this.destroyed) this.setData({ signingIn: false });
    }
  },
  onHide() {
    clearInterval(this.timer);
  },
  onUnload() {
    this.destroyed = true;
    clearInterval(this.timer);
  },
  async load() {
    if (!hasSession()) {
      clearInterval(this.timer);
      this.setData({
        needsLogin: true,
        loading: false,
        loadError: "",
        jobs: [],
        ongoing: [],
        completed: [],
        runningCount: 0,
        failedCount: 0,
      });
      return;
    }
    if (this.fetching) return;
    this.fetching = true;
    try {
      const jobs = (await request<Job[]>("/jobs"))
        .filter((j) => j.input.kind !== "chat")
        .map(jobView);
      if (this.destroyed) return;
      // Nothing in progress: stop polling until the page is shown again.
      if (!jobs.some((j) => /queued|running/.test(j.status)))
        clearInterval(this.timer);
      this.setData({
        jobs,
        loading: false,
        needsLogin: false,
        loadError: "",
        ongoing: jobs.filter((j) => j.status !== "succeeded"),
        completed: jobs.filter((j) => j.status === "succeeded"),
        runningCount: jobs.filter(
          (j) => j.status === "running" || j.status === "queued",
        ).length,
        failedCount: jobs.filter((j) => j.status === "failed").length,
      });
    } catch (e) {
      if (this.destroyed) return;
      if (!hasSession()) {
        clearInterval(this.timer);
        this.setData({
          needsLogin: true,
          loading: false,
          loadError: "",
          jobs: [],
          ongoing: [],
          completed: [],
        });
      } else this.setData({ loading: false, loadError: (e as Error).message });
    } finally {
      this.fetching = false;
      if (!this.destroyed) wx.stopPullDownRefresh();
    }
  },
  detail(e: WechatMiniprogram.TouchEvent) {
    openTask(e.currentTarget.dataset.id, this);
  },
  onPullDownRefresh() {
    void this.load();
  },
  works() {
    openPage(this, { url: "/pages/works/index" });
  },
  create() {
    openTab(this, "/pages/create/index");
  },
});
