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
import {
  pendingPayments,
  clearPayment,
  paymentMessage,
  watchPayments,
} from "../../services/payment-status";
Page({
  data: {
    rows: [] as Array<
      Row<Order> & {
        amount: string;
        points: string;
        state: string;
        time: string;
        canPay: boolean;
      }
    >,
    loading: true,
    needsLogin: false,
    loadError: "",
    busy: "",
  },
  revision: 0,
  destroyed: false,
  visible: false,
  watching: "",
  stopWatching: undefined as (() => void) | undefined,
  onShow() {
    this.visible = true;
    enterPage(this);
    void this.load();
  },
  onHide() {
    this.visible = false;
    this.stopWatching?.();
    this.watching = "";
  },
  onUnload() {
    this.onHide();
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
      const pendingIds = new Set(pendingPayments(rows[0]?.data.userId || ""));
      for (const row of rows) {
        if (row.data.status !== "created" && pendingIds.has(row.id)) {
          clearPayment(row.id);
          pendingIds.delete(row.id);
        }
      }
      this.setData({
        rows: rows.map((r) => {
          const awaiting = pendingIds.has(r.id),
            expired = Date.parse(r.data.expiresAt) <= Date.now();
          return {
            ...r,
            amount: money(r.data.amountFen),
            points: points(r.data.pointsUnits),
            state:
              r.data.status === "created"
                ? awaiting
                  ? "确认到账中"
                  : expired
                    ? "已过期"
                    : r.data.virtual?.issued
                      ? "需核对支付结果"
                      : "待支付"
                : orderStates[r.data.status] || r.data.status,
            canPay:
              r.data.status === "created" &&
              !awaiting &&
              !expired &&
              !r.data.virtual?.issued,
            time: date(r.createdAt),
          };
        }),
        needsLogin: false,
        loadError: "",
      });
      const pending = rows
        .filter((r) => pendingIds.has(r.id))
        .map((r) => r.id)
        .sort();
      const watchKey = JSON.stringify(pending);
      if (!pending.length) {
        this.stopWatching?.();
        this.watching = "";
      }
      if (pending.length && this.visible && this.watching !== watchKey) {
        this.stopWatching?.();
        this.watching = watchKey;
        this.stopWatching = watchPayments(
          pending,
          () => {
            this.watching = "";
            void this.load();
          },
          () => {
            this.watching = "";
          },
        );
      }
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
        title: paymentMessage(row.data.status),
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
