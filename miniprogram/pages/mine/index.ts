import {
  request,
  error,
  tab,
  media,
  openPage,
  hasSession,
  login,
  AuthCancelledError,
} from "../../utils/api";
import type { Me } from "../../services/types";

const baseMenus = [
  { icon: "order", label: "充值订单", mode: "orders", group: "账户与服务" },
  { icon: "image", label: "我的作品", mode: "works", group: "创作记录" },
  { icon: "heart", label: "我的收藏", mode: "favorites", group: "创作记录" },
  { icon: "history", label: "生成记录", mode: "tasks", group: "创作记录" },
  { icon: "notification", label: "消息通知", mode: "notifications", group: "帮助与设置" },
  { icon: "chat", label: "帮助与反馈", mode: "help", group: "帮助与设置" },
  { icon: "setting", label: "设置", mode: "settings", group: "帮助与设置" },
];
// Providers manage their codes in 服务商中心; members share their 推广码.
const roleMenus: Record<string, typeof baseMenus[number]> =
  {
    provider: { icon: "shop", label: "服务商中心", mode: "provider", group: "账户与服务" },
    member: { icon: "qrcode", label: "我的推广码", mode: "promo", group: "账户与服务" },
  };
Page({
  data: {
    me: null as Me | null,
    groups: ["账户与服务", "创作记录", "帮助与设置"],
    loading: true,
    loadError: "",
    menus: baseMenus,
  },
  loadVersion: 0,
  visible: true,
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
    const version = this.loadVersion;
    if (!hasSession()) return this.setData({ menus: baseMenus });
    try {
      const { kind } = await request<{ kind: string }>("/me/role");
      if (version !== this.loadVersion || !hasSession()) return;
      const extra =
        roleMenus[["branch", "s1", "s2"].includes(kind) ? "provider" : kind];
      this.setData({ menus: extra ? [extra, ...baseMenus] : baseMenus });
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
    if (this.refreshTimer !== undefined) clearTimeout(this.refreshTimer);
    if (!hasSession()) {
      this.setData({ me: null, loading: false, loadError: "" });
      return;
    }
    try {
      const me = await request<Me>("/me");
      if (version !== this.loadVersion) return;
      if (me.profile.data.avatarUrl)
        me.profile.data.avatarUrl = media(me.profile.data.avatarUrl);
      this.setData({
        me,
        loading: false,
        loadError: "",
      });
      if (this.visible && me.running > 0)
        this.refreshTimer = setTimeout(() => void this.load(), 3000);
    } catch (e) {
      if (version !== this.loadVersion) return;
      if (!hasSession()) {
        this.setData({ me: null, loadError: "", loading: false });
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
});
