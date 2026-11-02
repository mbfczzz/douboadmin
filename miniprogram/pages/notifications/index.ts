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
  async load() {
    if (this.destroyed) return;
    const revision = ++this.revision;
    if (!hasSession()) {
      this.setData({ needsLogin: true, loading: false, items: [] });
      return;
    }
    try {
      const result = await request<{ items: Row<Notice>[]; unread: number }>(
        "/notifications",
      );
      if (revision !== this.revision) return;
      this.setData({
        items: result.items.map((r) => ({ ...r, time: date(r.createdAt) })),
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
  async readAll() {
    try {
      await request("/notifications/read-all", "POST", {});
      await this.load();
    } catch (e) {
      if (!this.destroyed) error(e);
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
