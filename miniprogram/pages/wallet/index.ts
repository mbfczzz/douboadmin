import { pullRefresh } from "../../utils/refresh";
import { ask } from "../../services/dialog";
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
import { productCards, ledgerRows, loadInsights, loadArt } from "./insights";
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
  explain() {
    void ask({ title: "积分说明", content: "提交创作时先预留积分，生成成功后结算，失败自动退回。预留中的积分暂不可用，以积分明细为准。", showCancel: false, confirmText: "知道了", icon: "info-circle" });
  },
  data: walletData,
  revision: 0,
  loadedLedgerPage: 1,
  destroyed: false,
  visible: false,
  watching: "",
  checkoutToken: "",
  stopWatching: undefined as (() => void) | undefined,
  onShow() {
    this.visible = true;
    this.setData({ paymentWaiting: false });
    enterPage(this);
    void this.load();
  },
  onHide() {
    this.visible = false;
    this.revision++;
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
  onPullDownRefresh() {
    void pullRefresh(() => this.load());
  },
  async load() {
    if (this.destroyed) return;
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
      if (revision !== this.revision || info.wallet.userId !== sessionUserId()) return;
      const ledger = result
        ? financePage(result, this.data.ledgerPage)
        : undefined;
      if (ledger) this.loadedLedgerPage = ledger.page;
      this.setData({
        info,
        products: productCards(info.virtualProducts || []),
        price100: info.pricing?.retailPer100Fen ? money(info.pricing.retailPer100Fen) : "",
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
        ledger: ledger ? ledgerRows(ledger.items) : this.data.ledger,
        ...(ledger
          ? {
              ledgerPage: ledger.page,
              ledgerPages: Math.max(1, Math.ceil(ledger.total / ledger.size)),
              ledgerTotal: ledger.total,
            }
          : { ledgerPage: this.loadedLedgerPage }),
      });
      this.estimate();
      void loadInsights(this);
      void loadArt(this);
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
            "暂未确认到账，请先查看订单状态。另购不会取消原订单。",
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
