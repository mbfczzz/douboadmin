import { pullRefresh } from "../../utils/refresh";
import { readView, writeView, keepImages, rememberRows, VIEW_MAX_AGE } from "../../utils/view-cache";
import { elapsed, nextFilter } from "./view";
import { loadRefs } from "./refs";
import { movePage } from "../../services/list-page";
import {
  jobView,
  openTask,
  enterPage,
  openTab,
  hasSession,
  login,
  error,
} from "../../utils/api";
import { jobPage } from "../../services/job-pages";
import { dropCover } from "../../services/cover";
// A queue row: its counter group, cover (finished work) and elapsed time.
function row(j: ReturnType<typeof jobView>) {
  const live = /queued|running/.test(j.status), done = j.status === "succeeded";
  return { ...j, group: live ? "running" : done ? "done" : "failed", elapsed: live ? elapsed(j.createdAt, j.status) : "",
    cover: done ? j.thumbnailUrl || (j.input.kind === "image" ? j.result : "") || "" : "" };
}
Page({
  data: {
    // Every task on this page, newest first, with its counter group.
    jobs: [] as ReturnType<typeof row>[],
    runningCount: 0,
    failedCount: 0,
    doneCount: 0,
    loading: true,
    loadError: "",
    needsLogin: false,
    signingIn: false,
    page: 1,
    total: 0,
    refs: {} as Record<string, string>, // job id → its first reference image
    filter: "", // "", "running", "failed" or "done": the counters filter the list
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
        runningCount: 0,
        failedCount: 0,
        doneCount: 0,
      });
      return;
    }
    if (this.fetching) return;
    this.fetching = true;
    try {
      const result = await jobPage(this.data.page, "&excludeChat=true");
      // Keep the signed addresses already on screen before deriving each
      // cover from them; a new signature for the same picture would reload
      // (and blink) every thumbnail on every poll.
      const jobs = keepImages(this.data.jobs, result.items.filter((j) => j.input.kind !== "chat").map((j) => jobView(j))).map(row);
      if (this.destroyed) return;
      // Nothing in progress: stop polling until the page is shown again.
      if (!jobs.some((j) => j.group === "running")) clearInterval(this.timer);
      const count = (group: string) => jobs.filter((j) => j.group === group).length;
      const view = { jobs, total: result.total, loading: false, needsLogin: false, loadError: "",
        runningCount: count("running"), failedCount: count("failed"), doneCount: count("done") };
      rememberRows(jobs);
      // Polling every 3 s: send nothing to the view when nothing changed.
      const next = JSON.stringify([jobs, view.total]);
      if (next !== this.shown) {
        this.shown = next;
        this.setData(view);
        if (this.data.page === 1) writeView("tasks", { jobs, runningCount: view.runningCount, failedCount: view.failedCount, doneCount: view.doneCount, total: view.total });
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
    dropCover(this, e.currentTarget.dataset.id, "jobs");
  },
  onPullDownRefresh() {
    this.setData({ page: 1 });
    void pullRefresh(() => this.load()); // stops the spinner on every path
  },
  previous() {
    movePage(this, -1);
  },
  next() {
    movePage(this, 1);
  },
  pick(e: WechatMiniprogram.TouchEvent) {
    wx.vibrateShort?.({ type: "light" });
    this.setData({ filter: nextFilter(this.data.filter, e.currentTarget.dataset.filter) });
  },
  templates() {
    openTab(this, "/pages/templates/index");
  },
  create() {
    openTab(this, "/pages/studio/index");
  },
});
