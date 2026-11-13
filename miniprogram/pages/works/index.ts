import { readView, writeView, keepImages, rememberRows, VIEW_MAX_AGE } from "../../utils/view-cache";
import { movePage } from "../../services/list-page";
import {
  jobView,
  openTask,
  enterPage,
  openTab,
  login,
  hasSession,
  error,
} from "../../utils/api";
import type { Job } from "../../services/types";
import { jobPage } from "../../services/job-pages";
import { dropCover } from "../../services/cover";

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
    page: 1,
    total: 0,
  },
  loadVersion: 0,
  destroyed: false,
  onShow() {
    enterPage(this);
    // First open: last works show at once while the list refreshes.
    const seen = this.data.loading && hasSession() ? readView<{ works: ReturnType<typeof jobView>[]; total: number }>("works:" + this.data.filter, VIEW_MAX_AGE) : undefined;
    if (seen) {
      this.setData({ works: seen.works, total: seen.total, loading: false });
      this.filterWorks();
    }
    void this.load();
  },
  onUnload() {
    this.destroyed = true;
    this.loadVersion++;
  },
  onPullDownRefresh() {
    this.setData({ page: 1 });
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
      const result = await jobPage(
        this.data.page,
        "&works=true&kind=" +
          (this.data.filter === "all" ? "" : this.data.filter),
      );
      const jobs = result.items;
      if (version !== this.loadVersion) return;
      const works = keepImages(this.data.works, jobs
        .filter(
          (job) =>
            job.status === "succeeded" &&
            ["image", "video", "mix"].includes(job.input.kind) &&
            !job.deleted,
        )
        .map(jobView));
      rememberRows(works);
      if (this.data.page === 1) writeView("works:" + this.data.filter, { works, total: result.total });
      this.setData({
        works,
        total: result.total,
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
    this.setData({ filter: e.currentTarget.dataset.value, page: 1 });
    void this.load();
  },
  previous() {
    movePage(this, -1);
  },
  next() {
    movePage(this, 1);
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
  coverError(e: WechatMiniprogram.CustomEvent) {
    dropCover(this, e.currentTarget.dataset.id, "works", "filtered");
  },
  create() {
    openTab(this, "/pages/create/index");
  },
});
