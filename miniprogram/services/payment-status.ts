import { request } from "./request";
import { sessionToken } from "./session";
import type { Row, PendingPayment } from "./types";
import type { Order } from "./business";

function paymentRecords(): PendingPayment[] {
  const saved = wx.getStorageSync("pending-payments");
  const legacy = wx.getStorageSync("pending-payment");
  const records = [...(Array.isArray(saved) ? saved : []), legacy];
  const unique = new Map<string, PendingPayment>();
  for (const record of records) {
    if (
      record &&
      typeof record.id === "string" &&
      record.id &&
      typeof record.owner === "string" &&
      record.owner
    )
      unique.set(record.id, {
        id: record.id,
        owner: record.owner,
        deferred: record.deferred === true,
      });
  }
  return [...unique.values()];
}

function savePayments(records: PendingPayment[]) {
  if (records.length) wx.setStorageSync("pending-payments", records);
  else wx.removeStorageSync("pending-payments");
  wx.removeStorageSync("pending-payment");
}

export function pendingPayments(owner: string): string[] {
  return paymentRecords()
    .filter((record) => record.owner === owner)
    .map((record) => record.id);
}

export function pendingPayment(owner: string): string {
  return (
    paymentRecords().find(
      (record) => record.owner === owner && !record.deferred,
    )?.id || ""
  );
}

// Keep the old order queryable; this only releases the checkout-page lock after
// explicit user confirmation, and never declares a payment failed or complete.
export function deferPayment(id: string, owner: string) {
  savePayments(
    paymentRecords().map((record) =>
      record.id === id && record.owner === owner
        ? { ...record, deferred: true }
        : record,
    ),
  );
  const draft = wx.getStorageSync("pending-recharge") as
    { id?: string } | undefined;
  if (draft?.id === id) wx.removeStorageSync("pending-recharge");
}

export function rememberPayment(id: string, owner: string) {
  savePayments([
    ...paymentRecords().filter((record) => record.id !== id),
    { id, owner },
  ]);
}

export function clearPayment(id: string) {
  savePayments(paymentRecords().filter((record) => record.id !== id));
  const draft = wx.getStorageSync("pending-recharge") as
    { id?: string } | undefined;
  if (draft?.id === id) wx.removeStorageSync("pending-recharge");
}

export function watchPayments(
  ids: string[],
  onSettled: (row: Row<Order>) => void,
  onWaiting: () => void,
) {
  const unique = [...new Set(ids)];
  const spacing = Math.max(5000, unique.length * 1000);
  let remaining = unique.length;
  const finish = () => {
    if (--remaining === 0) onWaiting();
  };
  const stops = unique.map((id, index) =>
    watchPayment(
      id,
      (row) => {
        remaining--;
        onSettled(row);
      },
      finish,
      spacing,
      index * 1000,
    ),
  );
  return () => stops.forEach((stop) => stop());
}

export function paymentMessage(status: string): string {
  if (status === "paid") return "积分已到账";
  if (status === "refunding") return "订单退款处理中";
  if (status === "refunded") return "订单已退款";
  if (status === "closed") return "订单已关闭，请核对订单记录";
  return "支付已提交，正在确认到账，请勿重复支付";
}

// Read server-authoritative status while the page is visible. Never credit locally.
export function watchPayment(
  id: string,
  onSettled: (row: Row<Order>) => void,
  onWaiting: () => void,
  spacing = 5000,
  offset = 0,
) {
  const token = sessionToken();
  let stopped = false,
    round = 0,
    timer: ReturnType<typeof setTimeout> | undefined;
  const current = () => !stopped && !!token && sessionToken() === token;
  async function poll() {
    if (!current()) return;
    try {
      // At most three WeChat queries per minute; callbacks also update this row.
      if (round % 4 === 0) {
        try {
          await request(
            "/orders/" + id + "/refresh",
            "POST",
            {},
            undefined,
            false,
          );
        } catch {
          // An unavailable query does not prove that payment failed.
        }
      }
      if (!current()) return;
      const row = await request<Row<Order>>(
        "/orders/" + id,
        "GET",
        undefined,
        undefined,
        false,
      );
      if (!current()) return;
      if (row.data.status !== "created") {
        clearPayment(id);
        stopped = true;
        onSettled(row);
        return;
      }
    } catch {
      // Keep the pending reference for reentry and manual order queries.
    }
    if (!current()) return;
    round++;
    if (round >= 12) {
      stopped = true;
      onWaiting();
    } else timer = setTimeout(() => void poll(), spacing);
  }
  // Spread a page of pending orders across time instead of querying all at
  // once. Keep headroom below the user's API limit for balance and page loads.
  timer = setTimeout(() => void poll(), 1500 + offset);
  return () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
  };
}
