import {
  request,
  error,
  enterPage,
  hasSession,
  login,
  cancelled,
  date,
} from "../../utils/api";
import type { Row } from "../../services/types";
import type { Order } from "../../services/business";
import { money, points, orderStates } from "../../services/business";
import { payExisting } from "../../services/payment";
Page({
  data: {
    rows: [] as Array<
      Row<Order> & {
        amount: string;
        points: string;
        state: string;
        time: string;
      }
    >,
    loading: true,
    needsLogin: false,
    loadError: "",
    busy: "",
  },
  revision: 0,
  destroyed: false,
  onShow() {
    enterPage(this);
    void this.load();
  },
  onUnload() {
    this.destroyed = true;
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
      this.setData({ needsLogin: true, rows: [], loading: false });
      return;
    }
    try {
      const rows = await request<Row<Order>[]>("/orders");
      if (revision !== this.revision) return;
      this.setData({
        rows: rows.map((r) => ({
          ...r,
          amount: money(r.data.amountFen),
          points: points(r.data.pointsUnits),
          state: orderStates[r.data.status] || r.data.status,
          time: date(r.createdAt),
        })),
        needsLogin: false,
        loadError: "",
      });
    } catch (e) {
      if (revision === this.revision) {
        if (!hasSession())
          this.setData({ needsLogin: true, rows: [], loadError: "" });
        else this.setData({ loadError: (e as Error).message });
      }
    } finally {
      if (revision === this.revision) this.setData({ loading: false });
    }
  },
  async pay(e: WechatMiniprogram.TouchEvent) {
    if (this.data.busy) return;
    const id = e.currentTarget.dataset.id;
    this.setData({ busy: id });
    try {
      const row = await payExisting(id);
      if (this.destroyed) return;
      wx.showToast({
        title: row.data.status === "paid" ? "积分已到账" : "等待支付确认",
        icon: "none",
      });
      await this.load();
    } catch (e) {
      if (!this.destroyed && !cancelled(e)) error(e);
    } finally {
      if (!this.destroyed) this.setData({ busy: "" });
    }
  },
  async refresh(e: WechatMiniprogram.TouchEvent) {
    if (this.data.busy) return;
    const id = e.currentTarget.dataset.id;
    this.setData({ busy: id });
    try {
      await request("/orders/" + id + "/refresh", "POST", {});
      await this.load();
    } catch (e) {
      if (!this.destroyed) error(e);
    } finally {
      if (!this.destroyed) this.setData({ busy: "" });
    }
  },
});
