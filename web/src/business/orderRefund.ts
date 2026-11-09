import { api, type Row } from "../api";
import { ask } from "../confirm/ask";
import { money, type Order } from "./types";

// Apple orders are refunded by the user in the App Store, not from here.
export const canRefund = (order: Row<Order>) =>
  order.data.virtual?.platform !== "ios" &&
  (order.data.status === "paid" || order.data.status === "refunding");

// Full refund as its own row action. A refunding order retries the same
// refund request, so a repeated click never creates a second refund.
export async function refundOrder(order: Row<Order>) {
  const retry = order.data.status === "refunding";
  const reason = await ask({
    title: retry ? "重试原退款申请" : "申请全额退款",
    message: `订单 ${order.id} · ${money(order.data.amountFen)}。全额退款会回收该订单对应积分；可用积分不足时不能申请。`,
    confirmText: retry ? "重试退款" : "确认全额退款",
    danger: true,
    reason: { label: "退款原因", maxLength: 25 },
    run: (reason) =>
      api(`/admin/orders/${order.id}/refund`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
  });
  return reason !== false;
}
