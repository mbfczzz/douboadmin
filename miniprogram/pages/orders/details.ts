import { money } from "../../services/business";
import type { Order } from "../../services/business";
import type { Row } from "../../services/types";

const pad = (n: number) => String(n).padStart(2, "0");
const full = (s: string) => {
  const d = new Date(s);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// Extra, real facts for one order: unit price, payment window, the detail
// lines shown when the card is opened, and its three-step progress.
export function orderExtras(r: Row<Order>, now = Date.now()) {
  const o = r.data,
    left = Math.ceil((Date.parse(o.expiresAt) - now) / 60000),
    paid = o.status === "paid" || o.status === "refunding" || o.status === "refunded";
  const lines = [
    ["下单时间", full(r.createdAt)],
    ["支付方式", o.channel === "wechat_virtual" ? "微信虚拟支付" : "微信支付"],
    ["商品", o.virtual?.productName || "积分充值"],
    ...(o.virtual?.quantity && o.virtual.quantity > 1 ? [["数量", "× " + o.virtual.quantity]] : []),
    ...(o.pointsUnits > 0 ? [["单价", `¥${money(Math.round((o.amountFen * 10000) / o.pointsUnits))} / 100 积分`]] : []),
    ...(o.transactionId ? [["微信交易号", o.transactionId]] : []),
  ].map(([label, value]) => ({ label, value }));
  return {
    window: o.status === "created" && left > 0 ? `${left} 分钟内完成支付` : "",
    steps: [
      { label: "下单", on: true },
      { label: "支付", on: paid },
      { label: o.status === "refunded" ? "已退款" : "到账", on: o.status === "paid" || o.status === "refunded" },
    ],
    lines,
  };
}
