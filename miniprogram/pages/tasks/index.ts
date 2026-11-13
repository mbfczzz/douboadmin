import { readView, writeView, keepImages, rememberRows, VIEW_MAX_AGE } from "../../utils/view-cache";
import { elapsed, nextFilter } from "./view";
import { loadRefs } from "./refs";
import { movePage } from "../../services/list-page";
import {
  jobView,
  openTask,
  enterPage,
  openTab,
  openPage,
  hasSession,
  login,
  error,
} from "../../utils/api";
import { jobPage } from "../../services/job-pages";
import { dropCover } from "../../services/cover";
Page({
  data: {
    jobs: [] as ReturnType<typeof jobView>[],
    ongoing: [] as (ReturnType<typeof jobView> & { elapsed: string })[],
    completed: [] as ReturnType<typeof jobView>[],
    runningCount: 0,
    failedCount: 0,
    loading: true,
    loadError: "",
    needsLogin: false,
    signingIn: false,
    page: 1,
    total: 0,
    refs: {} as Record<string, string>, // job id → its first reference image
    filter: "", // "", "running" or "failed": the counters filter the list
  },
  timer: 0,
  shown: "", // last list sent to the view, to skip identical polls
  fetching: false,
  destroyed: false,
  onShow() {
    enterPage(this);
    // First open: the last list shows at once while the queue refreshes.
    const seen = this.data.loading && hasSession() ? readView<Record<string, unknown>>("tasks", VIEW_MAX_AGE) : undefined;
    if (seen) this.setData({ ...seen, loading: false });
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
      const result = await jobPage(this.data.page, "&excludeChat=true");
      const jobs = result.items
        .filter((j) => j.input.kind !== "chat")
        .map(jobView);
      if (this.destroyed) return;
      // Nothing in progress: stop polling until the page is shown again.
      if (!jobs.some((j) => /queued|running/.test(j.status)))
        clearInterval(this.timer);
      const view = {
        jobs,
        total: result.total,
        loading: false,
        needsLogin: false,
        loadError: "",
        ongoing: jobs
          .filter((j) => j.status !== "succeeded")
          .map((j) => ({ ...j, elapsed: /queued|running/.test(j.status) ? elapsed(j.createdAt, j.status) : "" })),
        completed: jobs.filter((j) => j.status === "succeeded"),
        runningCount: jobs.filter(
          (j) => j.status === "running" || j.status === "queued",
        ).length,
        failedCount: jobs.filter((j) => j.status === "failed").length,
      };
      view.completed = keepImages(this.data.completed, view.completed);
      rememberRows([...view.ongoing, ...view.completed]);
      // Polling every 3 s: send nothing to the view when nothing changed.
      const next = JSON.stringify([view.ongoing, view.completed, view.total]);
      if (next !== this.shown) {
        this.shown = next;
        this.setData(view);
        if (this.data.page === 1) writeView("tasks", { jobs: view.jobs, ongoing: view.ongoing, completed: view.completed, runningCount: view.runningCount, failedCount: view.failedCount, total: view.total });
      } else if (this.data.loading || this.data.loadError) this.setData({ loading: false, loadError: "" });
      void loadRefs(this);
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
  coverError(e: WechatMiniprogram.CustomEvent) {
    dropCover(this, e.currentTarget.dataset.id, "completed");
  },
  onPullDownRefresh() {
    this.setData({ page: 1 });
    void this.load();
  },
  previous() {
    movePage(this, -1);
  },
  next() {
    movePage(this, 1);
  },
  works() {
    openPage(this, { url: "/pages/works/index" });
  },
  pick(e: WechatMiniprogram.TouchEvent) {
    wx.vibrateShort?.({ type: "light" });
    this.setData({ filter: nextFilter(this.data.filter, e.currentTarget.dataset.filter) });
  },
  templates() {
    openTab(this, "/pages/templates/index");
  },
  create() {
    openTab(this, "/pages/create/index");
  },
});
