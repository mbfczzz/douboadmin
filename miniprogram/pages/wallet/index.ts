import {
  request,
  error,
  enterPage,
  hasSession,
  login,
  sessionUserId,
  openPage,
} from "../../utils/api";
import type { Row } from "../../services/types";
import { money, points } from "../../services/business";
import type { WalletInfo, VirtualProduct } from "../../services/business";
import { canRecharge } from "../../services/payment";
import {
  pendingPayment,
  paymentMessage,
  watchPayment,
} from "../../services/payment-status";
import { ledgerView } from "../../services/wallet-ledger";
import type { Ledger } from "../../services/wallet-ledger";
import { financePage } from "../../services/finance-page";
import type { FinancePage } from "../../services/finance-page";
import { walletData, loggedOut } from "./state";
import { checkout } from "./checkout";
import {
  estimateCheckout,
  confirmAdditionalPurchase,
} from "../../services/wallet-checkout";
Page({
  data: walletData,
  revision: 0,
  loadedLedgerPage: 1,
  destroyed: false,
  visible: false,
  watching: "",
  checkoutToken: "",
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
    const owner = this.data.info?.wallet.userId;
    if (owner && owner !== sessionUserId()) {
      this.stopWatching?.();
      this.watching = "";
      this.loadedLedgerPage = 1;
      this.setData({ ...loggedOut, loading: true, needsLogin: false });
    }
    if (!hasSession()) {
      this.setData(loggedOut);
      return;
    }
    try {
      this.setData({ loading: true });
      const [info, result] = await Promise.all([
        request<WalletInfo>("/wallet"),
        request<FinancePage<Ledger> | Row<Ledger>[]>(
          `/wallet/ledger?page=${this.data.ledgerPage}&size=20`,
        ).catch(() => undefined),
      ]);
      if (revision !== this.revision) return;
      const ledger = result
        ? financePage(result, this.data.ledgerPage)
        : undefined;
      if (ledger) this.loadedLedgerPage = ledger.page;
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
        error: ledger ? "" : "余额已更新，积分流水暂时无法加载，点击重试",
        ledger: ledger ? ledger.items.map(ledgerView) : this.data.ledger,
        ...(ledger
          ? {
              ledgerPage: ledger.page,
              ledgerPages: Math.max(1, Math.ceil(ledger.total / ledger.size)),
              ledgerTotal: ledger.total,
            }
          : { ledgerPage: this.loadedLedgerPage }),
      });
      this.estimate();
      this.trackPayment(pendingPayment(info.wallet.userId));
    } catch (e) {
      if (revision === this.revision) {
        this.setData({ ledgerPage: this.loadedLedgerPage });
        if (!hasSession()) this.setData(loggedOut);
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
  async changeLedgerPage(e: WechatMiniprogram.TouchEvent) {
    const page = this.data.ledgerPage + Number(e.currentTarget.dataset.step);
    if (this.data.loading || page < 1 || page > this.data.ledgerPages) return;
    this.setData({ ledgerPage: page });
    await this.load();
  },
  input(e: WechatMiniprogram.Input) {
    if (this.data.busy || this.data.pendingOrderId) return;
    this.setData({
      amount: e.detail.value,
      ...(this.data.purchaseMode === "custom"
        ? { customAmount: e.detail.value }
        : {}),
      paymentNotice: this.data.pendingOrderId ? this.data.paymentNotice : "",
    });
    this.estimate();
  },
  estimate() {
    this.setData(
      estimateCheckout(
        this.data.info,
        this.data.amount,
        this.data.productId,
        this.data.purchaseMode,
      ),
    );
  },
  choosePurchase(e: WechatMiniprogram.TouchEvent) {
    if (this.data.busy || this.data.pendingOrderId) return;
    const mode = e.currentTarget.dataset.mode;
    if (mode !== "package" && mode !== "custom") return;
    if (mode === "custom" && !this.data.info?.virtualCustom) return;
    this.setData({
      purchaseMode: mode,
      ...(mode === "custom" ? { amount: this.data.customAmount } : {}),
    });
    this.estimate();
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
        purchaseMode: "package",
        amount: money(product.amountFen),
        estimated: points(product.pointsUnits),
        paymentNotice: "",
      });
  },
  async pay() {
    await checkout(this);
  },
  orders() {
    openPage(this, { url: "/pages/orders/index" });
  },
});
