import { ICON, showArt } from "../../utils/ui-art";
import { readView, writeView, keepImages, rememberRows, VIEW_MAX_AGE, freshUrl, noteIssued } from "../../utils/view-cache";
import { pullRefresh } from "../../utils/refresh";
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
  { icon: "order", art: ICON.orders, label: "充值订单", mode: "orders" },
  { icon: "heart", art: ICON.favorites, label: "我的收藏", mode: "favorites" },
  { icon: "history", art: ICON.history, label: "生成记录", mode: "tasks" },
  { icon: "notification", art: ICON.notifications, label: "消息通知", mode: "notifications" },
  { icon: "chat", art: ICON.help, label: "帮助与反馈", mode: "help" },
  { icon: "setting", art: ICON.settings, label: "设置", mode: "settings" },
];
// Providers manage their codes in 服务商中心; members share their 推广码.
// The role entry gets its own row so the six common entries stay a 3 × 2 grid.
const roleMenus: Record<string, { icon: string; art?: string; glyph?: string; label: string; mode: string; hint: string }> =
  {
    provider: { icon: "cooperate", art: ICON.provider, label: "服务商中心", mode: "provider", hint: "邀请码 · 会员 · 后台登录" },
    member: { icon: "qrcode", glyph: "/assets/glyphs/qrcode-brand.png", label: "我的推广码", mode: "promo", hint: "分享推广码，邀请好友加入" },
  };
Page({
  data: {
    me: null as Me | null,
    jobs: [] as ReturnType<typeof jobView>[],
    worksError: "",
    worksLoading: false,
    // The list has answered once for this account: later refreshes on return
    // keep the current cards (or the empty card) instead of a skeleton flash.
    worksKnown: false,
    roleLabel: "",
    loading: true,
    loadError: "",
    menus: baseMenus,
    roleMenu: null as ((typeof baseMenus)[number] & { hint: string }) | null,
    icons: { avatar: ICON.avatar, create: ICON.create },
    backdrop: "", // shown until the user has a work cover (showArt)
    unread: 0,
  },
  loadVersion: 0,
  visible: true,
  owner: "",
  refreshTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  onShow() {
    this.visible = true;
    showArt(this, (art) => ({ backdrop: art.mineBackdrop }));
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
  // Unread notices badge the 消息通知 tile; a failure leaves it as it was.
  async loadUnread(version: number, owner: string) {
    try {
      const r = await request<{ unread: number }>("/notifications?page=1&size=1");
      if (version === this.loadVersion && owner === sessionUserId()) this.setData({ unread: r.unread || 0 });
    } catch {
      // keep the badge as it is
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
  onPullDownRefresh() {
    void pullRefresh(() => this.load());
  },
  async load() {
    const version = ++this.loadVersion;
    const owner = sessionUserId();
    if (owner !== this.owner) {
      this.owner = owner;
      // Show this account's last profile at once instead of a spinner.
      const seen = owner ? readView<{ me: Me; jobs: ReturnType<typeof jobView>[] }>("mine", VIEW_MAX_AGE) : undefined;
      this.setData({ me: seen?.me || null, jobs: seen?.jobs || [], worksKnown: !!seen, worksError: "", roleLabel: "", roleMenu: null, loading: !seen });
    }
    if (this.refreshTimer !== undefined) clearTimeout(this.refreshTimer);
    if (!hasSession()) {
      this.setData({ me: null, loading: false, loadError: "" });
      return;
    }
    this.setData({ worksLoading: true });
    // Three covers: one row of the 3-column grid.
    const recentRequest = jobPage(1, "&works=true", 3).catch(() => null);
    try {
      const me = await request<Me>("/me");
      if (version !== this.loadVersion || owner !== sessionUserId()) return;
      const before = this.data.me?.profile.data;
      const keep = !!me.profile.data.avatarId && before?.avatarId === me.profile.data.avatarId && freshUrl(before?.avatarUrl);
      if (me.profile.data.avatarUrl) {
        me.profile.data.avatarUrl = keep ? before!.avatarUrl : media(me.profile.data.avatarUrl); // same avatar, young URL: no reload
        noteIssued(me.profile.data.avatarUrl);
      }
      this.setData({ me, loading: false, loadError: "" });
      void this.loadUnread(version, owner);
      const recent = await recentRequest;
      if (version !== this.loadVersion || owner !== sessionUserId()) return;
      const jobs = recent ? keepImages(this.data.jobs, recent.items.filter(j => j.status === "succeeded" && !j.deleted).slice(0, 3).map(jobView)) : this.data.jobs;
      this.setData({
        jobs,
        worksError: recent ? "" : "作品暂时无法加载，点击重试",
        worksLoading: false,
        worksKnown: true,
      });
      if (recent) writeView("mine", { me, jobs }); // never re-save an old list as new
      rememberRows(jobs);
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
