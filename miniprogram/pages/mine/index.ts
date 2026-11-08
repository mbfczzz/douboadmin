import {
  request,
  error,
  tab,
  media,
  jobView,
  openTask,
  openPage,
  openTab,
  hasSession,
  login,
  AuthCancelledError,
} from "../../utils/api";
import type { Me, Job } from "../../services/types";
Page({
  data: {
    me: null as Me | null,
    jobs: [] as ReturnType<typeof jobView>[],
    loading: true,
    loadError: "",
    avatarLetter: "豆",
    cover: "",
    menus: [
      { icon: "wallet", label: "我的积分", mode: "wallet" },
      { icon: "order", label: "充值订单", mode: "orders" },
      { icon: "heart", label: "我的收藏", mode: "favorites" },
      { icon: "history", label: "生成记录", mode: "tasks" },
      { icon: "notification", label: "消息通知", mode: "notifications" },
      { icon: "chat", label: "帮助与反馈", mode: "help" },
      { icon: "setting", label: "设置", mode: "settings" },
    ],
  },
  loadVersion: 0,
  visible: true,
  refreshTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  onShow() {
    this.visible = true;
    tab(this, 4);
    void this.load();
  },
  onHide() {
    this.visible = false;
    if (this.refreshTimer !== undefined) clearTimeout(this.refreshTimer);
  },
  onUnload() {
    this.visible = false;
    this.loadVersion++;
    if (this.refreshTimer !== undefined) clearTimeout(this.refreshTimer);
  },
  async load() {
    const version = ++this.loadVersion;
    if (this.refreshTimer !== undefined) clearTimeout(this.refreshTimer);
    if (!hasSession()) {
      this.setData({ me: null, jobs: [], loading: false, loadError: "" });
      return;
    }
    try {
      const [me, jobs] = await Promise.all([
        request<Me>("/me"),
        request<Job[]>("/jobs"),
      ]);
      if (version !== this.loadVersion) return;
      if (me.profile.data.avatarUrl)
        me.profile.data.avatarUrl = media(me.profile.data.avatarUrl);
      this.setData({
        me,
        avatarLetter: Array.from(me.profile.data.nickname)[0] || "豆",
        jobs: jobs
          .filter(
            (j) =>
              ["image", "video", "mix"].includes(j.input.kind) &&
              j.status === "succeeded" &&
              !j.deleted,
          )
          .slice(0, 3)
          .map(jobView),
        loading: false,
        loadError: "",
      });
      if (this.visible && me.running > 0)
        this.refreshTimer = setTimeout(() => void this.load(), 3000);
    } catch (e) {
      if (version !== this.loadVersion) return;
      if (!hasSession()) {
        this.setData({ me: null, jobs: [], loadError: "", loading: false });
        return;
      }
      if (e instanceof AuthCancelledError) return;
      this.setData({ loadError: (e as Error).message, loading: false });
    }
  },
  async signIn() {
    try {
      await login();
      await this.load();
    } catch (e) {
      error(e);
    }
  },
  menu(e: WechatMiniprogram.TouchEvent) {
    const m = e.currentTarget.dataset.mode;
    if (m === "tasks") openPage(this, { url: "/pages/tasks/index" });
    else if (["wallet", "orders", "notifications"].includes(m))
      openPage(this, { url: "/pages/" + m + "/index" });
    else if (m === "settings")
      openPage(this, { url: "/pages/preferences/index" });
    else openPage(this, { url: "/pages/library/index?mode=" + m });
  },
  detail(e: WechatMiniprogram.TouchEvent) {
    openTask(e.currentTarget.dataset.id, this);
  },
  tasks() {
    openPage(this, { url: "/pages/tasks/index" });
  },
  works() {
    openPage(this, { url: "/pages/works/index" });
  },
  emptyWorks() {
    if (this.data.me?.running) this.tasks();
    else this.create();
  },
  favorites() {
    openPage(this, { url: "/pages/library/index?mode=favorites" });
  },
  edit() {
    if (this.data.me) openPage(this, { url: "/pages/profile/index" });
  },
  create() {
    openTab(this, "/pages/create/index");
  },
});
