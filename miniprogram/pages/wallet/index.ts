import {
  request,
  error,
  enterPage,
  hasSession,
  login,
  openPage,
  cancelled,
  date,
} from "../../utils/api";
import type { Row } from "../../services/types";
import { money, points } from "../../services/business";
import type { WalletInfo } from "../../services/business";
import { amountFen, canRecharge, recharge } from "../../services/payment";
interface Ledger {
  kind: string;
  availableDelta: number;
  heldDelta: number;
  note: string;
  availableAfter: number;
}
const labels: Record<string, string> = {
  topup: "充值到账",
  admin_adjust: "管理员调整",
  job_hold: "任务预留",
  job_charge: "生成扣减",
  job_release: "失败退回",
  refund_hold: "退款预留",
  refund_complete: "退款回收",
  refund_cancel: "退款关闭",
};
Page({
  data: {
    loading: true,
    needsLogin: false,
    error: "",
    info: null as WalletInfo | null,
    available: "0",
    held: "0",
    amount: "10",
    estimated: "0",
    displayRate: "0",
    allowed: false,
    busy: false,
    ledger: [] as Array<{
      id: string;
      title: string;
      note: string;
      change: string;
      time: string;
    }>,
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
    const revision = ++this.revision;
    if (!hasSession()) {
      this.setData({
        loading: false,
        needsLogin: true,
        info: null,
        ledger: [],
      });
      return;
    }
    try {
      const [info, rows] = await Promise.all([
        request<WalletInfo>("/wallet"),
        request<Row<Ledger>[]>("/wallet/ledger"),
      ]);
      if (revision !== this.revision) return;
      this.setData({
        info,
        available: points(info.wallet.availableUnits),
        held: points(info.wallet.heldUnits),
        allowed: canRecharge(info),
        needsLogin: false,
        error: "",
        ledger: rows.map((r) => ({
          id: r.id,
          title: labels[r.data.kind] || r.data.kind,
          note: r.data.note,
          change:
            (r.data.availableDelta > 0 ? "+" : "") +
            points(r.data.availableDelta),
          time: date(r.createdAt),
        })),
      });
      this.estimate();
    } catch (e) {
      if (revision === this.revision) {
        if (!hasSession())
          this.setData({
            needsLogin: true,
            info: null,
            ledger: [],
            available: "0",
            held: "0",
            allowed: false,
            error: "",
          });
        else this.setData({ error: (e as Error).message });
      }
    } finally {
      if (revision === this.revision) this.setData({ loading: false });
    }
  },
  input(e: WechatMiniprogram.Input) {
    this.setData({ amount: e.detail.value });
    this.estimate();
  },
  estimate() {
    const n = amountFen(this.data.amount);
    this.setData({
      estimated: points(
        Math.floor(
          (n * (this.data.info?.settings.pointsPerYuan || 0) * 10000) /
            (this.data.info?.pricing?.retailPer100Fen || 10000),
        ),
      ),
      displayRate: points(
        Math.floor(
          (100 * (this.data.info?.settings.pointsPerYuan || 0) * 10000) /
            (this.data.info?.pricing?.retailPer100Fen || 10000),
        ),
      ),
    });
  },
  async pay() {
    if (this.data.busy || !this.data.info) return;
    const fen = amountFen(this.data.amount),
      settings = this.data.info.settings;
    if (fen < settings.minRechargeFen || fen > settings.maxRechargeFen) {
      error(
        new Error(
          `请输入 ${money(settings.minRechargeFen)}–${money(settings.maxRechargeFen)} 元`,
        ),
      );
      return;
    }
    this.setData({ busy: true });
    try {
      const row = await recharge(this.data.info, fen);
      if (this.destroyed) return;
      wx.showToast({
        title: row.data.status === "paid" ? "积分已到账" : "支付结果确认中",
        icon: "none",
      });
      await this.load();
    } catch (e) {
      if (!this.destroyed && !cancelled(e)) {
        error(e);
        if ((e as { status?: number }).status === 409) await this.load();
      }
    } finally {
      if (!this.destroyed) this.setData({ busy: false });
    }
  },
  orders() {
    openPage(this, { url: "/pages/orders/index" });
  },
});
