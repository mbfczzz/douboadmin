import {
  request,
  error,
  tab,
  media,
  openPage,
  hasSession,
  login,
  AuthCancelledError,
  jobView,
  openTask,
  openTab,
  sessionUserId,
} from "../../utils/api";
import type { Me } from "../../services/types";
import { jobPage } from "../../services/job-pages";
import { dropCover } from "../../services/cover";

const baseMenus = [
  { icon: "order", label: "充值订单", mode: "orders" },
  { icon: "heart", label: "我的收藏", mode: "favorites" },
  { icon: "history", label: "生成记录", mode: "tasks" },
  { icon: "notification", label: "消息通知", mode: "notifications" },
  { icon: "chat", label: "帮助与反馈", mode: "help" },
  { icon: "setting", label: "设置", mode: "settings" },
];
// Providers manage their codes in 服务商中心; members share their 推广码.
// The role entry gets its own row so the six common entries stay a 3 × 2 grid.
const roleMenus: Record<string, typeof baseMenus[number]> =
  {
    provider: { icon: "cooperate", label: "服务商中心", mode: "provider" },
    member: { icon: "qrcode", label: "我的推广码", mode: "promo" },
  };
Page({
  data: {
    me: null as Me | null,
    jobs: [] as ReturnType<typeof jobView>[],
    worksError: "",
    worksLoading: false,
    roleLabel: "",
    loading: true,
    loadError: "",
    menus: baseMenus,
    roleMenu: null as (typeof baseMenus)[number] | null,
  },
  loadVersion: 0,
  visible: true,
  owner: "",
  refreshTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  onShow() {
    this.visible = true;
    tab(this, 4);
    void this.load();
    void this.loadIdentity();
  },
  // Providers get 服务商中心, members 我的推广码. A failed request keeps the
  // current menu; a newer load or a signed-out session wins.
  async loadIdentity() {
    const version = this.loadVersion, owner = sessionUserId();
    if (!hasSession()) return this.setData({ roleMenu: null });
    try {
      const { kind, label } = await request<{ kind: string; label: string }>("/me/role");
      if (version !== this.loadVersion || owner !== sessionUserId() || !hasSession()) return;
      const extra =
        roleMenus[["branch", "s1", "s2"].includes(kind) ? "provider" : kind];
      this.setData({ roleMenu: extra || null, roleLabel: label || "" });
    } catch {
      // keep the menu as it is
    }
  },
  onHide() {
    this.visible = false;
    this.loadVersion++;
    if (this.refreshTimer !== undefined) clearTimeout(this.refreshTimer);
  },
  onUnload() {
    this.visible = false;
    this.loadVersion++;
    if (this.refreshTimer !== undefined) clearTimeout(this.refreshTimer);
  },
  async load() {
    const version = ++this.loadVersion;
    const owner = sessionUserId();
    if (owner !== this.owner) {
      this.owner = owner;
      this.setData({ me: null, jobs: [], worksError: "", roleLabel: "", roleMenu: null, loading: true });
    }
    if (this.refreshTimer !== undefined) clearTimeout(this.refreshTimer);
    if (!hasSession()) {
      this.setData({ me: null, loading: false, loadError: "" });
      return;
    }
    this.setData({ worksLoading: true });
    const recentRequest = jobPage(1, "&works=true", 2).catch(() => null);
    try {
      const me = await request<Me>("/me");
      if (version !== this.loadVersion || owner !== sessionUserId()) return;
      if (me.profile.data.avatarUrl)
        me.profile.data.avatarUrl = media(me.profile.data.avatarUrl);
      this.setData({ me, loading: false, loadError: "" });
      const recent = await recentRequest;
      if (version !== this.loadVersion || owner !== sessionUserId()) return;
      this.setData({
        jobs: recent ? recent.items.filter(j => j.status === "succeeded" && !j.deleted).slice(0, 2).map(jobView) : this.data.jobs,
        worksError: recent ? "" : "作品暂时无法加载，点击重试",
        worksLoading: false,
      });
      if (this.visible && me.running > 0)
        this.refreshTimer = setTimeout(() => void this.load(), 3000);
    } catch (e) {
      if (version !== this.loadVersion || owner !== sessionUserId()) return;
      if (!hasSession()) {
        this.setData({ me: null, loadError: "", loading: false });
        return;
      }
      this.setData({
        loadError: e instanceof AuthCancelledError ? "加载已中断，请重试" : (e as Error).message,
        loading: false, worksLoading: false,
      });
    }
  },
  async signIn() {
    try {
      await login();
      await this.load();
      void this.loadIdentity();
    } catch (e) {
      error(e);
    }
  },
  menu(e: WechatMiniprogram.TouchEvent) {
    const m = e.currentTarget.dataset.mode;
    if (m === "tasks") openPage(this, { url: "/pages/tasks/index" });
    else if (m === "promo")
      openPage(this, { url: "/pages/provider/index?mode=promo" });
    else if (["wallet", "orders", "notifications", "provider", "works"].includes(m))
      openPage(this, { url: "/pages/" + m + "/index" });
    else if (m === "settings")
      openPage(this, { url: "/pages/preferences/index" });
    else openPage(this, { url: "/pages/library/index?mode=" + m });
  },
  edit() {
    if (this.data.me) openPage(this, { url: "/pages/profile/index" });
  },
  detail(e: WechatMiniprogram.TouchEvent) {
    openTask(e.currentTarget.dataset.id, this);
  },
  coverError(e: WechatMiniprogram.CustomEvent) {
    dropCover(this, e.currentTarget.dataset.id, "jobs");
  },
  create() {
    openTab(this, "/pages/create/index");
  },
});
