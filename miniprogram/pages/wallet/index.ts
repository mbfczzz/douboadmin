import {
  request,
  error,
  enterPage,
  hasSession,
  login,
  openPage,
  cancelled,
} from "../../utils/api";
import type { Row } from "../../services/types";
import { money, points } from "../../services/business";
import type { WalletInfo, VirtualProduct } from "../../services/business";
import { amountFen, canRecharge, recharge } from "../../services/payment";
import {
  pendingPayment,
  paymentMessage,
  watchPayment,
} from "../../services/payment-status";
import { ledgerView } from "../../services/wallet-ledger";
import type { Ledger } from "../../services/wallet-ledger";
import { PaymentCancelledError } from "../../services/errors";
import {
  estimateCheckout,
  confirmAdditionalPurchase,
} from "../../services/wallet-checkout";
Page({
  data: {
    productId: "",
    products: [] as Array<{
      id: string;
      name: string;
      amount: string;
      points: string;
    }>,
    loading: true,
    needsLogin: false,
    error: "",
    info: null as WalletInfo | null,
    available: "—",
    held: "0",
    amount: "10",
    estimated: "0",
    displayRate: "0",
    allowed: false,
    busy: false,
    pendingOrderId: "",
    paymentWaiting: false,
    paymentNotice: "",
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
  visible: false,
  watching: "",
  stopWatching: undefined as (() => void) | undefined,
  refreshTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  onShow() {
    this.visible = true;
    this.setData({ paymentWaiting: false });
    enterPage(this);
    void this.load();
  },
  onHide() {
    this.visible = false;
    this.revision++;
    if (this.refreshTimer !== undefined) clearTimeout(this.refreshTimer);
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
    if (this.refreshTimer !== undefined) clearTimeout(this.refreshTimer);
    const revision = ++this.revision;
    if (!hasSession()) {
      this.setData({
        loading: false,
        needsLogin: true,
        productId: "",
        products: [],
        info: null,
        ledger: [],
        available: "—",
        held: "0",
        allowed: false,
        pendingOrderId: "",
        paymentNotice: "",
      });
      return;
    }
    try {
      const [info, rows] = await Promise.all([
        request<WalletInfo>("/wallet"),
        request<Row<Ledger>[]>("/wallet/ledger").catch(() => undefined),
      ]);
      if (revision !== this.revision) return;
      this.setData({
        info,
        products: (info.virtualProducts || []).map((p) => ({
          id: p.id,
          name: p.name,
          amount: money(p.amountFen),
          points: points(p.pointsUnits),
        })),
        productId: info.virtualProducts?.some(
          (p) => p.id === this.data.productId,
        )
          ? this.data.productId
          : "",
        available: points(info.wallet.availableUnits),
        held: points(info.wallet.heldUnits),
        allowed: canRecharge(info),
        needsLogin: false,
        error: rows ? "" : "余额已更新，积分流水暂时无法加载，点击重试",
        ledger: rows ? rows.map(ledgerView) : this.data.ledger,
      });
      this.estimate();
      this.trackPayment(pendingPayment(info.wallet.userId));
    } catch (e) {
      if (revision === this.revision) {
        if (!hasSession())
          this.setData({
            needsLogin: true,
            productId: "",
            products: [],
            info: null,
            ledger: [],
            available: "0",
            held: "0",
            allowed: false,
            pendingOrderId: "",
            paymentNotice: "",
            error: "",
          });
        else this.setData({ error: (e as Error).message });
      }
    } finally {
      if (revision === this.revision) {
        this.setData({ loading: false });
        if (
          this.visible &&
          hasSession() &&
          this.data.info?.wallet.heldUnits > 0
        )
          this.refreshTimer = setTimeout(() => void this.load(), 3000);
      }
    }
  },
  trackPayment(id: string) {
    if (id && id === this.data.pendingOrderId && this.data.paymentWaiting)
      return;
    this.setData({ pendingOrderId: id, paymentWaiting: false });
    if (!id) {
      this.stopWatching?.();
      this.watching = "";
      return;
    }
    if (!this.visible || this.watching === id) return;
    this.stopWatching?.();
    this.watching = id;
    this.setData({ paymentNotice: paymentMessage("created") });
    this.stopWatching = watchPayment(
      id,
      (row) => {
        this.watching = "";
        this.setData({
          pendingOrderId: "",
          paymentNotice: paymentMessage(row.data.status),
        });
        void this.load();
      },
      () => {
        this.watching = "";
        this.setData({
          paymentWaiting: true,
          paymentNotice:
            "到账仍在确认中，请到充值订单查询；另购前请确认原订单可能仍会到账",
        });
      },
    );
  },
  input(e: WechatMiniprogram.Input) {
    this.setData({
      amount: e.detail.value,
      paymentNotice: this.data.pendingOrderId ? this.data.paymentNotice : "",
    });
    this.estimate();
  },
  estimate() {
    this.setData(
      estimateCheckout(this.data.info, this.data.amount, this.data.productId),
    );
  },
  async additionalPurchase() {
    const id = this.data.pendingOrderId,
      owner = this.data.info?.wallet.userId;
    if (!id || !owner || !this.data.paymentWaiting || this.data.busy) return;
    this.setData({ busy: true });
    try {
      if ((await confirmAdditionalPurchase(id, owner)) && !this.destroyed) {
        this.trackPayment("");
        this.setData({
          paymentNotice: "原订单仍可在充值订单中查询，请选择新的购买项目",
        });
      }
    } finally {
      if (!this.destroyed) this.setData({ busy: false });
    }
  },
  chooseProduct(e: WechatMiniprogram.TouchEvent) {
    if (this.data.busy || this.data.pendingOrderId) return;
    const product = this.data.info?.virtualProducts?.find(
      (p: VirtualProduct) => p.id === e.currentTarget.dataset.id,
    );
    if (product)
      this.setData({
        productId: product.id,
        amount: money(product.amountFen),
        estimated: points(product.pointsUnits),
        paymentNotice: "",
      });
  },
  async pay() {
    if (this.data.busy || !this.data.info || this.data.pendingOrderId) return;
    const pending = pendingPayment(this.data.info.wallet.userId);
    if (pending) {
      this.trackPayment(pending);
      return;
    }
    const fen = amountFen(this.data.amount),
      settings = this.data.info.settings;
    if (
      this.data.info.paymentChannel === "wechat_virtual" &&
      !this.data.productId
    ) {
      error(new Error("请选择积分商品"));
      return;
    }
    if (fen < settings.minRechargeFen || fen > settings.maxRechargeFen) {
      error(
        new Error(
          `请输入 ${money(settings.minRechargeFen)}–${money(settings.maxRechargeFen)} 元`,
        ),
      );
      return;
    }
    this.setData({ busy: true, paymentNotice: "" });
    try {
      const row = await recharge(this.data.info, fen, this.data.productId);
      if (this.destroyed) return;
      wx.showToast({
        title: paymentMessage(row.data.status),
        icon: "none",
      });
      this.setData({ paymentNotice: paymentMessage(row.data.status) });
      this.trackPayment(row.data.status === "created" ? row.id : "");
      await this.load();
    } catch (e) {
      if (!this.destroyed && e instanceof PaymentCancelledError)
        this.setData({
          paymentNotice: "已取消本次支付，可在充值订单中查看结果",
        });
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
