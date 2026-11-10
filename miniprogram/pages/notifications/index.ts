import {
  request,
  error,
  enterPage,
  hasSession,
  login,
  openPage,
  date,
} from "../../utils/api";
import type { Row } from "../../services/types";
import type { Notice } from "../../services/business";
Page({
  data: {
    items: [] as Array<Row<Notice> & { time: string }>,
    unread: 0,
    loading: true,
    needsLogin: false,
    loadError: "",
    page: 1,
    total: 0,
  },
  revision: 0,
  visible: true,
  opening: false,
  destroyed: false,
  onShow() {
    this.visible = true;
    enterPage(this);
    void this.load();
  },
  onHide() {
    this.visible = false;
    this.revision++;
    this.setData({loading:false});
  },
  onUnload() {
    this.destroyed = true;
    this.visible = false;
    this.revision++;
  },
  async signIn() {
    try {
      await login();
      await this.load();
    } catch (e) {
      error(e);
    }
  },
  async load(append = false) {
    if (this.destroyed || !this.visible) return;
    append = append === true;
    if (append && this.data.loading) return;
    const page = append ? this.data.page + 1 : 1;
    this.setData({loading: true});
    const revision = ++this.revision;
    if (!hasSession()) {
      this.setData({ needsLogin: true, loading: false, items: [], unread:0, total:0, page:1 });
      return;
    }
    try {
      const result = await request<{ items: Row<Notice>[]; unread: number; total: number }>(
        "/notifications?page=" + page + "&size=20",
      );
      if (revision !== this.revision) return;
      const rows=[...(append ? this.data.items : []), ...result.items.map((r) => ({ ...r, time: date(r.createdAt) }))];
      this.setData({
        items: [...new Map(rows.map(row=>[row.id,row])).values()],
        page, total: result.total ?? result.items.length,
        unread: result.unread,
        needsLogin: false,
        loadError: "",
      });
    } catch (e) {
      if (revision === this.revision) {
        if (!hasSession())
          this.setData({
            needsLogin: true,
            items: [],
            unread: 0,
            loadError: "",
          });
        else this.setData({ loadError: (e as Error).message });
      }
    } finally {
      if (revision === this.revision) this.setData({ loading: false });
    }
  },
  more() { if (this.data.page*20<this.data.total) void this.load(true); },
  async readAll() {
    if (!this.visible || this.destroyed) return;
    const revision=this.revision;
    try {
      await request("/notifications/read-all", "POST", {});
      if (!this.visible || revision!==this.revision) return;
      await this.load();
    } catch (e) {
      if (!this.destroyed && this.visible) error(e);
    }
  },
  async open(e: WechatMiniprogram.TouchEvent) {
    if (this.opening || !this.visible) return;
    const row = this.data.items.find(
      (r: Row<Notice>) => r.id === e.currentTarget.dataset.id,
    );
    if (!row) return;
    const revision = this.revision;
    this.opening = true;
    try {
      await request("/notifications/" + row.id + "/read", "PUT", {});
      if (!this.visible || revision !== this.revision) return;
      if (row.data.targetId) {
        openPage(this, {
          url:
            row.data.kind === "order"
              ? "/pages/orders/index"
              : "/pages/task-detail/index?id=" + row.data.targetId,
        });
      } else await this.load();
    } catch (e) {
      if (this.visible) error(e);
    } finally {
      this.opening = false;
    }
  },
});
