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
  upload,
  RequestError,
  AuthCancelledError,
} from "../../utils/api";
import type { Me, Job } from "../../services/types";
Page({
  data: {
    me: null as Me | null,
    jobs: [] as ReturnType<typeof jobView>[],
    loading: true,
    loadError: "",
    profileOpen: false,
    nickname: "",
    bio: "",
    name: "",
    phone: "",
    busy: false,
    uploadingAvatar: false,
    avatarId: "",
    avatarUrl: "",
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
  editRevision: 0,
  editVersion: 0,
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
    this.editRevision++;
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
      if (this.visible && me.running > 0 && !this.data.profileOpen)
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
  async chooseAvatar(e: WechatMiniprogram.CustomEvent<{ avatarUrl: string }>) {
    if (this.data.uploadingAvatar || !e.detail.avatarUrl) return;
    this.setData({ uploadingAvatar: true });
    const revision = this.editRevision;
    try {
      const size = await new Promise<number>((resolve, reject) =>
        wx.getFileSystemManager().getFileInfo({
          filePath: e.detail.avatarUrl,
          success: (r) => resolve(r.size),
          fail: () => reject(new Error("无法读取头像，请重新选择")),
        }),
      );
      if (size > 5 * 1024 * 1024) throw new Error("请选择 5 MB 以内的头像");
      if (revision !== this.editRevision) return;
      const a = await upload(e.detail.avatarUrl, true);
      if (revision === this.editRevision)
        this.setData({ avatarId: a.id, avatarUrl: a.data.url });
    } catch (e) {
      error(e);
    } finally {
      this.setData({ uploadingAvatar: false });
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
    if (!this.data.me || this.data.busy) return;
    this.editRevision++;
    if (this.refreshTimer !== undefined) clearTimeout(this.refreshTimer);
    this.editVersion = this.data.me.profile.version;
    this.setData({
      profileOpen: true,
      nickname: this.data.me.profile.data.nickname,
      bio: this.data.me.profile.data.bio,
      name: this.data.me.profile.data.name || "",
      phone: this.data.me.profile.data.phone || "",
      avatarId: this.data.me.profile.data.avatarId || "",
      avatarUrl: this.data.me.profile.data.avatarUrl || "",
    });
  },
  close() {
    this.editRevision++;
    this.setData({ profileOpen: false });
    if (this.visible && this.data.me?.running > 0)
      this.refreshTimer = setTimeout(() => void this.load(), 3000);
  },
  input(e: WechatMiniprogram.Input) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },
  async save(e?: WechatMiniprogram.FormSubmit) {
    if (this.data.busy || this.data.uploadingAvatar || !this.data.me) return;
    const values = e?.detail.value as
      | { nickname?: string; bio?: string; name?: string; phone?: string }
      | undefined;
    if (values)
      this.setData({
        nickname: values.nickname ?? this.data.nickname,
        bio: values.bio ?? this.data.bio,
        name: values.name ?? this.data.name,
        phone: values.phone ?? this.data.phone,
      });
    this.setData({ busy: true });
    try {
      await request("/me", "PUT", {
        version: this.editVersion,
        nickname: this.data.nickname,
        bio: this.data.bio,
        name: this.data.name,
        phone: this.data.phone,
        avatarId: this.data.avatarId,
      });
      this.setData({ profileOpen: false });
      await this.load();
    } catch (e) {
      if (e instanceof RequestError && e.status === 409) {
        await this.load();
        this.editVersion = this.data.me?.profile.version || this.editVersion;
        error(new Error("资料已在其他地方更新，请确认当前内容后重新保存"));
      } else error(e);
    } finally {
      this.setData({ busy: false });
    }
  },
  create() {
    openTab(this, "/pages/create/index");
  },
});
