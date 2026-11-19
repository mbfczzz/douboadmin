import { date } from "../utils/ui";
import { points } from "./business";
import type { Row } from "./types";

import type { Ledger } from "./ledger-types";
export type { Ledger } from "./ledger-types";

const labels: Record<string, string> = {
  topup: "充值到账",
  admin_adjust: "管理员调整",
  job_hold: "生成扣除",
  job_charge: "生成扣除",
  job_release: "失败退回",
  refund_hold: "退款扣回",
  refund_complete: "退款回收",
  refund_cancel: "退款取消，已退回",
};

const glyph = (name: string) => `/assets/glyphs/${name}.png`;
// Points are taken when a task is submitted and returned if it fails; the
// list (server-filtered) only holds changes to the spendable balance.
export function ledgerView(row: Row<Ledger>) {
  const entry = row.data;
  return {
    glyph: glyph(entry.kind === "topup" ? "add-success" : entry.kind.includes("release") || entry.kind.includes("refund") ? "refresh-muted" : entry.kind === "admin_adjust" ? "settings-muted" : "image-muted"),
    id: row.id,
    title: labels[entry.kind] || entry.kind,
    note: entry.note,
    change: (entry.availableDelta > 0 ? "+" : "") + points(entry.availableDelta),
    tone: entry.availableDelta > 0 ? "plus" : "",
    time: date(row.createdAt),
  };
}
