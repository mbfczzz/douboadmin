import { request, error, saveFailed } from "../../utils/api";

import type { Code, Child, Center } from "../../services/provider-types";
export type { Code, Child, Center } from "../../services/provider-types";

const roles: Record<string, string> = {
  branch: "分公司",
  s1: "S1 服务商",
  s2: "S2 推荐官",
};
const tabs = [
  ["s1", "S1 服务商邀请码", "新用户扫码登记为你的 S1 服务商"],
  ["s2", "S2 推荐官邀请码", "新用户扫码登记为你的 S2 推荐官"],
  [
    "member",
    "子账号开通码",
    "用户扫码登记为子账号（会员），直接归属当前服务商",
  ],
] as const;
const pretty = (code: string) => code.slice(0, 4) + "-" + code.slice(4);

// A provider's own page (服务商中心): its codes, the providers right below it
// and its admin login. With ?mode=promo it is a member's 推广码 instead.
// The server only ever returns this account and what is below it.
Page({
  data: {
    promo: false,
    center: null as Center | null,
    roleName: "",
    tabs: [] as { key: string; label: string }[],
    tab: "",
    note: "",
    shown: { code: "", raw: "", qr: "" },
    children: [] as (Child & { roleName: string; date: string })[],
    childrenPage: 0,
    childrenTotal: 0,
    childrenLoading: false,
    childrenError: "",
    password: "",
    busy: false,
    loadError: "",
  },
  onLoad(options: Record<string, string>) {
    this.setData({ promo: options.mode === "promo" });
  },
  onShow() {
    void this.load();
  },
  async load() {
    try {
      if (this.data.promo) {
        const c = await request<Code>("/promo");
        this.setData({
          note: "好友扫码登记为会员，推荐人记为你",
          shown: { code: pretty(c.code), raw: c.code, qr: c.qr },
          loadError: "",
        });
        return;
      }
      const center = await request<Center>("/provider?children=paged");
      this.setData({
        center,
        roleName: center.roleName || roles[center.role] || "服务商",
        tabs: tabs
          .filter(([key]) => center.codes[key])
          .map(([key, label]) => ({ key, label })),
        password: center.password || "",
        loadError: "",
      });
      this.show(this.data.tab);
      if (center.role !== "s2") await this.loadChildren(true);
    } catch (e) {
      this.setData({ loadError: (e as Error).message });
    }
  },
  childRevision: 0,
  onHide() {
    this.childRevision++;
    this.setData({ childrenLoading: false });
  },
  onUnload() {
    this.onHide();
  },
  async loadChildren(reset = false) {
    if (this.data.childrenLoading && !reset) return;
    const revision = ++this.childRevision;
    const page = reset ? 1 : this.data.childrenPage + 1;
    if (reset)
      this.setData({ children: [], childrenPage: 0, childrenTotal: 0 });
    this.setData({ childrenLoading: true, childrenError: "" });
    try {
      const result = await request<{
        items: Child[];
        page: number;
        total: number;
      }>(`/provider/children?page=${page}`);
      if (revision !== this.childRevision) return;
      const incoming = result.items.map((c) => ({
        ...c,
        roleName: c.roleName || roles[c.role] || "",
        date: c.createdAt.slice(0, 10),
      }));
      const rows = reset ? incoming : [...this.data.children, ...incoming];
      this.setData({
        children: [...new Map(rows.map((row) => [row.id, row])).values()],
        childrenPage: result.page,
        childrenTotal: result.total,
      });
    } catch (e) {
      if (revision === this.childRevision)
        this.setData({ childrenError: (e as Error).message });
    } finally {
      if (revision === this.childRevision)
        this.setData({ childrenLoading: false });
    }
  },
  moreChildren() {
    void this.loadChildren();
  },
  switchTab(e: WechatMiniprogram.TouchEvent) {
    this.show(e.currentTarget.dataset.tab);
  },
  show(tab: string) {
    const c = this.data.center;
    if (!c) return;
    const available = tabs.filter(([key]) => c.codes[key]);
    const found = available.find(([key]) => key === tab) || available[0];
    if (!found) return;
    const code = c.codes[found[0]];
    if (!code) return;
    this.setData({
      tab: found[0],
      note: found[2] + "，上级开通后生效",
      shown: { code: pretty(code.code), raw: code.code, qr: code.qr },
    });
  },
  copy(e: WechatMiniprogram.TouchEvent) {
    wx.setClipboardData({ data: e.currentTarget.dataset.text });
  },
  async save() {
    const { qr, raw } = this.data.shown;
    if (!qr || this.data.busy) return;
    const path = `${wx.env.USER_DATA_PATH}/share-${raw}.png`;
    this.setData({ busy: true });
    try {
      wx.getFileSystemManager().writeFileSync(
        path,
        qr.replace(/^data:image\/png;base64,/, ""),
        "base64",
      );
      await wx.saveImageToPhotosAlbum({ filePath: path });
      wx.showToast({ title: "已保存到相册", icon: "success" });
    } catch (e) {
      saveFailed(e);
    } finally {
      this.setData({ busy: false });
    }
  },
  async password() {
    if (this.data.busy) return;
    if (this.data.center?.account) {
      const { confirm } = await wx.showModal({
        title: "重置后台密码？",
        content: "原密码会立即失效，需要用新密码重新登录管理后台。",
        confirmText: "重置",
        confirmColor: "#b42338",
      });
      if (!confirm) return;
    }
    this.setData({ busy: true });
    try {
      const out = await request<{ account: string; password: string }>(
        "/provider/password",
        "POST",
        {},
      );
      this.setData({
        password: out.password,
        "center.account": out.account,
        "center.passwordChanged": false,
      });
    } catch (e) {
      error(e);
    } finally {
      this.setData({ busy: false });
    }
  },
});
