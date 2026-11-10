import { request, error, saveFailed } from "../../utils/api";

type Code = { code: string; qr: string };
interface Child {
  id: string;
  name: string;
  role: string;
  status: string;
  members: number;
  account: string;
  scanned: boolean;
  createdAt: string;
}
interface Center {
  name: string;
  status: string;
  role: string; // branch, s1 or s2
  members: number;
  codes: { member?: Code; s1?: Code; s2?: Code };
  children?: Child[];
  account: string;
  owner: boolean; // registered by scanning; manages its own login
  password?: string;
  passwordChanged?: boolean;
}

const roles: Record<string, string> = {
  branch: "分公司",
  s1: "S1 服务商",
  s2: "S2 推荐官",
};
const tabs = [
  ["member", "会员开通码", "用户扫码登记为你的会员"],
  ["s1", "S1 邀请码", "新用户扫码登记为你的 S1 服务商"],
  ["s2", "S2 邀请码", "新用户扫码登记为你的 S2 推荐官"],
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
    tab: "member",
    note: "",
    shown: { code: "", raw: "", qr: "" },
    children: [] as (Child & { roleName: string; date: string })[],
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
      const center = await request<Center>("/provider");
      this.setData({
        center,
        roleName: roles[center.role] || "服务商",
        tabs: tabs
          .filter(([key]) => center.codes[key])
          .map(([key, label]) => ({ key, label })),
        children: (center.children || []).map((c) => ({
          ...c,
          roleName: roles[c.role] || "",
          date: c.createdAt.slice(0, 10),
        })),
        password: center.password || "",
        loadError: "",
      });
      this.show(this.data.tab);
    } catch (e) {
      this.setData({ loadError: (e as Error).message });
    }
  },
  switchTab(e: WechatMiniprogram.TouchEvent) {
    this.show(e.currentTarget.dataset.tab);
  },
  show(tab: string) {
    const c = this.data.center;
    if (!c) return;
    const found = tabs.find(([key]) => key === tab && c.codes[key]) || tabs[0];
    const code = c.codes[found[0]];
    if (!code) return;
    this.setData({
      tab: found[0],
      note: found[2] + "，总部开通后生效",
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
