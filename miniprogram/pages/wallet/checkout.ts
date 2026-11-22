import { error, cancelled, request } from "../../utils/api";
import { PaymentCancelledError } from "../../services/errors";
import { VirtualPaymentRejectedError } from "../../services/virtual-failure";
import { recharge, amountFen } from "../../services/payment";
import { pendingPayment, paymentMessage, clearPayment } from "../../services/payment-status";
import type { Row } from "../../services/types";
import type { Order } from "../../services/business-types";
import { sessionToken, sessionUserId } from "../../services/session";

import type { WalletEditor as Editor } from "../../services/page-contracts";

export async function checkout(page: Editor) {
  const d = page.data,
    info = d.info;
  if (d.busy || !info || d.pendingOrderId) return;
  const token = sessionToken();
  if (!token || sessionUserId() !== info.wallet.userId) return page.load();
  const pending = pendingPayment(info.wallet.userId);
  if (pending) return page.trackPayment(pending);
  page.checkoutToken = token;
  const current = () =>
    !page.destroyed &&
    page.checkoutToken === token &&
    sessionToken() === token &&
    sessionUserId() === info.wallet.userId;
  page.setData({ busy: true, paymentNotice: "" });
  try {
    const row = await recharge(
      info,
      amountFen(d.amount),
      d.productId,
      d.purchaseMode,
    );
    if (!current()) return page.load();
    wx.showToast({ title: paymentMessage(row.data.status), icon: "none" });
    page.setData({ paymentNotice: paymentMessage(row.data.status) });
    page.trackPayment(row.data.status === "created" ? row.id : "");
    await page.load();
  } catch (e) {
    if (!current()) return page.load();
    if (e instanceof PaymentCancelledError)
      page.setData({ paymentNotice: "已取消本次支付，可在充值订单中查看结果" });
    if (e instanceof VirtualPaymentRejectedError)
      page.setData({ paymentNotice: e.message });
    if (!cancelled(e)) {
      error(e);
      if ((e as { status?: number }).status === 409) await page.load();
    }
  } finally {
    if (!page.destroyed && page.checkoutToken === token) {
      page.checkoutToken = "";
      page.setData({ busy: false });
    }
  }
}

// While 到账待确认 (automatic checks have stopped), each load looks at the
// order once, so a late confirmation ends the wait instead of leaving the
// purchase section hidden. A failed lookup just keeps waiting.
export async function recheckWaiting(page: Editor) {
  const id = page.data.pendingOrderId;
  if (!id || !page.data.paymentWaiting) return;
  try {
    const row = await request<Row<Order>>("/orders/" + id);
    if (page.destroyed || page.data.pendingOrderId !== id || row.data.status === "created") return;
    clearPayment(id);
    page.trackPayment("");
    page.setData({ paymentNotice: paymentMessage(row.data.status) });
  } catch {
    /* still waiting; 充值订单 can query it */
  }
}

